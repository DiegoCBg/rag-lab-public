"""IndexService — Validação rigorosa, Chroma confirmation e JSON atômico.

Validações de indexação:
  - texto extraído vazio → falha;
  - nenhum chunk produzido → falha;
  - quantidade de embeddings != chunks → falha;
  - embedding None/vazio/lista vazia → falha;
  - dimensões divergentes → falha;
  - sucesso parcial (collection.add parcial) → falha.

Compensação:
  - se Chroma gravou mas JSON falhou: remover IDs daquela tentativa;
  - se collection.add falhou: consultar e remover IDs parciais;
  - nunca apagar coleção inteira ou IDs de outros documentos.

JSON atômico:
  - escrever em .tmp no mesmo diretório → rename atomico → UTF-8;
  - temporário removido em falha;
  - nunca deixar JSON parcial.
"""

import json
import logging
import os
import tempfile
from pathlib import Path

from app.core.config import settings
from app.models.document import Document
from app.services.chroma_service import ChromaService
from app.services.embedding_service import EmbeddingService
from app.services import runtime_settings
from app.services.runtime_settings import get_provider_embedding_model
from app.utils.text_processing import extract_text, chunk_text

logger = logging.getLogger(__name__)


class IndexBuilder:
    """Construtor de indexação para um único documento.

    Encapsula todo o ciclo: extração → chunks → embeddings → Chroma → JSON.
    """

    def __init__(self, doc: Document):
        self.doc = doc
        # IDs Chroma inseridos nesta tentativa (para compensação)
        self._chroma_ids: list[str] = []
        self._chunks: list[str] = []
        self.embedding_provider: str | None = None
        self.embedding_model: str | None = None

    # ─── Propriedade de ID para exceptions ──────────────────────────────
    @property
    def chroma_ids(self):
        return self._chroma_ids

    # ─── Passo 1: extração de texto ────────────────────────────────────
    def _extract_text(self) -> str:
        """Extraí texto do arquivo físico. Lança ValueError se vazio."""
        text = extract_text(self.doc.path)
        if not text or not text.strip():
            raise ValueError('Texto extraído está vazio — documento não contém conteúdo legível.')
        return text.strip()

    # ─── Passo 2: chunking ─────────────────────────────────────────────
    def _create_chunks(self, text: str) -> list[str]:
        """Cria chunks. Lança ValueError se nenhum chunk for produzido."""
        self._chunks = chunk_text(text)
        if not self._chunks:
            raise ValueError('Nenhum chunk foi produzido a partir do texto extraído.')
        return self._chunks

    # ─── Passo 3: embeddings (mockado pelo teste quando necessário) ─────
    async def _get_embeddings(self, chunks: list[str]) -> list[list[float]]:
        """Retorna embeddings. Pode ser substituído por mock."""
        self.embedding_provider = runtime_settings.get_active_provider()
        self.embedding_model = get_provider_embedding_model(self.embedding_provider)
        return await EmbeddingService.embed(chunks, provider=self.embedding_provider)

    # ─── Passo 4: validação de embeddings ──────────────────────────────
    @staticmethod
    def _validate_embeddings(embeddings: list[list[float]], expected_count: int):
        """Valida que embeddings correspondem aos chunks. Lança ValueError."""
        if not embeddings:
            raise ValueError('Embeddings ausentes — o serviço retornou lista vazia.')
        if len(embeddings) != expected_count:
            raise ValueError(
                f'Quantidade de embeddings ({len(embeddings)}) diverge '
                f'da quantidade de chunks ({expected_count}).'
            )
        # Verificar cada embedding
        first_dim = None
        for i, emb in enumerate(embeddings):
            if emb is None:
                raise ValueError(f'Embedding do chunk {i} é None.')
            if not isinstance(emb, (list, tuple)):
                raise ValueError(f'Embedding do chunk {i} não é sequência numérica.')
            if len(emb) == 0:
                raise ValueError(f'Embedding do chunk {i} é vazio.')
            # Verificar se são numéricos
            for j, val in enumerate(emb):
                if not isinstance(val, (int, float)):
                    raise ValueError(f'Valor não numérico no embedding {i}[{j}]: {type(val).__name__}')
                if isinstance(val, bool):
                    raise ValueError(f'Valor booleano no embedding {i}[{j}].')
            # Verificar dimensão consistente
            if first_dim is None:
                first_dim = len(emb)
            elif len(emb) != first_dim:
                raise ValueError(
                    f'Dimensão divergente: chunk 0 tem {first_dim} dimensões, '
                    f'chunk {i} tem {len(emb)} dimensões.'
                )

    # ─── Passo 5: gravação no Chroma com confirmação ───────────────────
    def _add_to_chroma(self, embeddings: list[list[float]]):
        """Grava chunks no Chroma e confirma que todos os IDs existem.

        Recebe *embeddings* como argumento para que o caller (build())
        possa validá-los antes da gravação.
        """
        collection = ChromaService.collection()

        # Gerar IDs únicas para cada chunk
        ids = [f'{self.doc.id}_chunk_{i}' for i in range(len(self._chunks))]
        self._chroma_ids = ids

        # Preparar metadados completos por chunk
        chunk_metadatas = []
        for i, chunk in enumerate(self._chunks):
            meta: dict = {
                'document_id': str(self.doc.id),
                'filename': self.doc.filename,
                'content_type': self.doc.content_type,
                'chunk_id': ids[i],
                'chunk_index': i,
            }
            chunk_metadatas.append(meta)

        # Chroma limita o tamanho do batch (max ~5461). Para documentos
        # grandes, gravar em lotes menores; se um lote falhar, compensar
        # apenas os IDs enviados nesse lote.
        batch_size = 500
        for start in range(0, len(ids), batch_size):
            end = start + batch_size
            batch_ids = ids[start:end]
            try:
                collection.add(
                    ids=batch_ids,
                    documents=self._chunks[start:end],
                    metadatas=chunk_metadatas[start:end],
                    embeddings=embeddings[start:end],
                )
            except Exception as exc:
                # Tentar compensar IDs parciais deste lote
                self._compensate_partial_chroma(batch_ids, exc)
                raise ValueError(
                    f'Falha ao gravar no Chroma: {str(exc)}.'
                ) from exc

        # ── Confirmar que todos os IDs existem ─────────────────────
        try:
            fetched = collection.get(ids=ids)
            if fetched is None or not fetched.get('ids'):
                raise ValueError(
                    f'Nenhum ID confirmado no Chroma para {ids}.'
                )

            found_ids = fetched['ids']
            expected_set = set(ids)
            found_set = set(found_ids)

            missing = expected_set - found_set
            if missing:
                raise ValueError(
                    f'IDs ausentes no Chroma após gravação: {sorted(missing)}.'
                )
        except Exception as exc2:
            self._compensate_chroma(ids, exc2)
            raise

    # ─── Passo 6: JSON atômico ────────────────────────────────────────
    def _write_json(self, payload: dict):
        """Grava JSON atomicamente via tempfile + rename."""
        index_dir = Path(settings.index_dir)
        index_dir.mkdir(parents=True, exist_ok=True)

        filename = f'document_{self.doc.id}.json'
        target = index_dir / filename

        fd = None
        tmp_path = None
        try:
            # Escrever em arquivo temporário no mesmo diretório
            fd, tmp_path = tempfile.mkstemp(
                dir=str(index_dir),
                prefix='.tmp_document_',
                suffix='.json',
            )
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            fd = None  # já fechado por fdopen

            # Substituir atomicamente
            os.replace(tmp_path, str(target))
        except Exception as exc:
            # Remover temporário em falha
            if fd is not None:
                try:
                    os.close(fd)
                except OSError:
                    pass
            if tmp_path and Path(tmp_path).exists():
                try:
                    Path(tmp_path).unlink()
                except OSError:
                    pass
            raise ValueError(f'Falha ao gravar JSON de índice: {str(exc)}.') from exc

    def _remove_index_json(self) -> None:
        target = Path(settings.index_dir) / f'document_{self.doc.id}.json'
        try:
            if target.exists():
                target.unlink()
        except OSError as exc:
            logger.error('Falha ao remover JSON de índice do documento %s: %s', self.doc.id, exc)

    # ─── Compensação ──────────────────────────────────────────────────
    def _compensate_partial_chroma(self, expected_ids: list[str], original_exc: Exception):
        """Tenta compensar quando collection.add falhou parcialmente."""
        try:
            collection = ChromaService.collection()
            # Consultar quais IDs daquela tentativa existem
            fetched = collection.get(ids=expected_ids)
            if fetched and fetched.get('ids'):
                found_in_batch = set(fetched['ids']) & set(expected_ids)
                if found_in_batch:
                    collection.delete(list(found_in_batch))
                    logger.warning(
                        'IDs removidos da tentativa parcial: %s', sorted(found_in_batch)
                    )
        except Exception as comp_exc:
            logger.error(
                'Falha na compensação parcial (original: %s): %s',
                str(original_exc),
                str(comp_exc),
            )

    def _compensate_chroma(self, ids: list[str], exc: Exception):
        """Remove os IDs específicos de tentativa falhada."""
        try:
            collection = ChromaService.collection()
            # Verificar quais existem (para remover)
            fetched = collection.get(ids=ids)
            ids_to_delete = []
            if fetched and fetched.get('ids'):
                ids_to_delete = [iid for iid in ids if iid in fetched['ids']]

            if ids_to_delete:
                collection.delete(ids_to_delete)
                logger.warning(
                    'IDs removidos em compensação: %s', sorted(ids_to_delete)
                )
        except Exception as comp_exc:
            logger.error(
                'Falha na compensação Chroma para IDs %s (original: %s): %s',
                sorted(ids),
                str(exc),
                str(comp_exc),
            )

    # ─── Build principal ──────────────────────────────────────────────
    async def build(self) -> dict:
        """Build completo com validações rigorosas.

        Retorna o payload do JSON de índice.
        Lança ValueError em qualquer falha.
        """
        # 1. Extração
        text = self._extract_text()

        # 2. Chunking
        chunks = self._create_chunks(text)

        # 3. Embeddings (pode ser mockado pelo teste)
        embeddings = await self._get_embeddings(chunks)

        # 4. Validação de embeddings
        self._validate_embeddings(embeddings, len(chunks))

        # 5. Gravação Chroma com confirmação
        self._add_to_chroma(embeddings)

        # 6. JSON atômico (precisa dos IDs do Chroma)
        payload = {
            'document_id': self.doc.id,
            'filename': self.doc.filename,
            'embedding_provider': self.embedding_provider,
            'embedding_model': self.embedding_model,
            'chunks': [
                {'chunk_index': i, 'text': chunk}
                for i, chunk in enumerate(chunks)
            ],
            'embedding_ids': self._chroma_ids,
            'total_chunks': len(chunks),
        }
        try:
            self._write_json(payload)
        except Exception as exc:
            self._compensate_chroma(self._chroma_ids, exc)
            self._remove_index_json()
            raise

        return payload


class IndexService:
    """Factory que cria o builder para um documento."""

    @staticmethod
    async def build_for_document(doc: Document):
        """Cria e executa o builder para o documento.

        Se o texto extraído estiver vazio, nenhum chunk for produzido ou
        embeddings forem inválidos → lança ValueError (não marca como indexed).
        """
        # Verificar pré-requisitos básicos do documento
        if not doc.path or not Path(doc.path).exists():
            raise ValueError('Arquivo físico do documento não encontrado.')

        builder = IndexBuilder(doc)
        return await builder.build()
