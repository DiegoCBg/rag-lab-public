"""DocumentService — Máquina de estados, identidade física única e transações.

Estados permitidos: uploaded → processing → indexed | failed
Identidade física: {uuid}_{safe_filename}{ext}
Transação explícita com rollback em falha.
"""

import json
import logging
import re
import uuid
from pathlib import Path
from sqlalchemy.orm import Session

from fastapi import HTTPException

from app.core.config import settings
from app.models.document import Document
from app.services.chroma_service import ChromaService, VectorStoreUnavailable
from app.services.index_service import IndexService

logger = logging.getLogger(__name__)

# ─── Máquina de estados ───────────────────────────────────────────────
STATE_UPLOADED = "uploaded"
STATE_PROCESSING = "processing"
STATE_INDEXED = "indexed"
STATE_FAILED = "failed"

_STATES = {STATE_UPLOADED, STATE_PROCESSING, STATE_INDEXED, STATE_FAILED}


class DocumentService:
    """Serviço de documentos com transação explícita e identidade física única."""

    # ─── Identidade física única ──────────────────────────────────────

    @staticmethod
    def _sanitize_filename(name: str) -> str:
        """Retorna nome seguro: remove caracteres problemáticos, reduz repetições."""
        safe = re.sub(r'[^a-zA-Z0-9_\-.]', '_', name)
        safe = re.sub(r'_+', '_', safe)
        return safe.strip('_')

    @staticmethod
    def _physical_path_for(upload_dir: Path, document_id: int, filename: str) -> Path:
        """Retorna caminho físico único preservando a extensão real.

        Formato: ``{uuid}{_safe_stem}{ext}`` onde:
          * *uuid* garante unicidade mesmo para nomes idênticos;
          * *safe_stem* é o stem sanitizado (sem diretório, sem caracteres
            perigosos);
          * *ext* é a **extensão original** do arquivo.

        Exemplos::

            'relatorio.pdf'       → '<uuid>_relatorio.pdf'
            'arquivo com espaços.docx' → '<uuid>_arquivo_com_espaces.docx'
        """
        if not filename or not filename.strip():
            raise ValueError('Filename deve conter pelo menos um caractere útil.')

        stem = Path(filename).stem
        ext = Path(filename).suffix  # mantém a extensão original (ex: .pdf)

        if not stem:
            raise ValueError('Filename sem nome útil (stem vazio).')

        safe_stem = DocumentService._sanitize_filename(stem)
        unique_name = f'{uuid.uuid4().hex}_{safe_stem}{ext}'
        return upload_dir / unique_name

    # ─── Criação do registro (sem indexação) ──────────────────────────

    @staticmethod
    def _create_pending(
        db: Session,
        filename: str,
        content_type: str | None,
        physical_path: str,
    ) -> Document:
        """Cria um documento EM MEMÓRIA (sem commit) com path preenchido.

        O *physical_path* é **obrigatório** — nunca deve ser None.
        O caminho é calculado ANTES da criação do objeto para garantir que o
        INSERT SQL contenha path não-nulo, evitando NOT NULL constraint violation.
        """
        doc = Document(
            filename=filename,
            content_type=content_type or 'unknown',
            path=physical_path,
            status=STATE_UPLOADED,
        )
        db.add(doc)
        db.flush()  # Gera o ID e confirma que path é válido
        return doc

    @staticmethod
    async def save_upload(db: Session, filename: str, content_type: str | None, data: bytes) -> Document:
        """Salva arquivo físico + registro como 'uploaded', depois indexa e confirma 'indexed'.

        Fluxo obrigatório:
          1. criar identidade do documento (flush → ID)
          2. salvar arquivo físico (identidade única)
          3. persistir registro como uploaded (commit)
          4. status processing
          5. executar indexação
          6. confirmar Chroma e JSON
          7. status indexed + commit

        Em falha: rollback → recuperar → failed → commit → propagar erro.
        """
        upload_dir = Path(settings.upload_dir)
        upload_dir.mkdir(parents=True, exist_ok=True)

        doc: Document | None = None
        physical_path: Path | None = None

        try:
            # ── Passo 1: construir caminho físico único ANTES do INSERT ───
            physical_path = DocumentService._physical_path_for(upload_dir, None, filename)

            # ── Passo 2: criar registro com path preenchido (flush → ID) ─
            doc = DocumentService._create_pending(db, filename, content_type, str(physical_path))

            # ── Passo 3: salvar arquivo físico (identidade única) ────────
            physical_path.write_bytes(data)

            # ── Passo 4: persistir como 'uploaded' (primeiro commit) ─────
            db.commit()
            db.refresh(doc)

            # ── Passo 5: transição para 'processing' ─────────────────────
            doc.status = STATE_PROCESSING
            db.commit()
            db.refresh(doc)

        except VectorStoreUnavailable as exc:
            try:
                db.rollback()
            except Exception:
                pass
            raise HTTPException(
                status_code=503,
                detail='Chroma indisponível. Inicie o serviço vetorial e tente enviar novamente.',
            ) from exc
        except Exception as exc:
            # ── Falha antes do commit: rollback total ──────────────────
            try:
                db.rollback()
            except Exception:
                pass
            # Se arquivo físico foi criado mas o registro falhou, remover órfão
            if physical_path and physical_path.exists():
                try:
                    physical_path.unlink()
                except OSError:
                    pass
            logger.error('Falha ao criar documento: %s', exc)
            raise HTTPException(
                status_code=500,
                detail='Não foi possível criar o documento.',
            ) from exc

        # ── Passo 6: indexação (com separação de contexto) ─────────────
        try:
            index_payload = await IndexService.build_for_document(doc)
        except Exception as exc:
            # ── IndexService.build_for_document pode ter invalidado a sessão ─
            # SQLAlchemy em erro lança InvalidRequestError antes de rollback.
            # Portanto: ROLLBACK SEMPRE ANTES de qualquer commit/consulta.
            try:
                db.rollback()
            except Exception:
                pass

            # Agora podemos safely consultar e atualizar o documento
            doc_id_to_fail = doc.id if doc else None
            try:
                failed_doc = db.query(Document).filter_by(id=doc_id_to_fail).one()
                failed_doc.status = STATE_FAILED
                db.commit()
            except Exception as log_fail:
                logger.error(
                    'Falha ao persistir status failed para documento %s: %s',
                    doc_id_to_fail,
                    log_fail,
                )
                # Registrar a exceão original junto com o erro de falha
                logger.error(
                    'Indexação falhou para documento %d (%s) — '
                    'exceção original: %s; falha ao marcar failed: %s',
                    doc_id_to_fail,
                    filename,
                    str(exc),
                    log_fail,
                )
            else:
                logger.error(
                    'Indexação falhou para documento %d (%s): %s',
                    doc_id_to_fail,
                    filename,
                    str(exc),
                )
            raise HTTPException(
                status_code=500,
                detail='Não foi possível indexar o documento.',
            ) from exc

        # ── Passo 7 & 8: confirmar Chroma + JSON → status 'indexed' ──
        try:
            doc.embedding_provider = index_payload.get('embedding_provider')
            doc.embedding_model = index_payload.get('embedding_model')
            doc.status = STATE_INDEXED
            db.commit()
            db.refresh(doc)
        except Exception as exc2:
            try:
                db.rollback()
            except Exception:
                pass
            try:
                doc.status = STATE_FAILED
                db.commit()
            except Exception:
                pass
            logger.error('Falha ao confirmar status indexed para documento %d: %s', doc.id, exc2)
            raise HTTPException(
                status_code=500,
                detail='Não foi possível confirmar o status do documento.',
) from exc2

        return doc

    @staticmethod
    def list_documents(db: Session):
        """Retorna todos os documentos ordenados por ID descendente, com
        content_type, data e contagem de chunks (lida do JSON de índice)."""
        items = db.query(Document).order_by(Document.id.desc()).all()
        return [DocumentService.serialize(item) for item in items]

    @staticmethod
    def serialize(item: Document) -> dict:
        return {
            'id': item.id,
            'filename': item.filename,
            'status': item.status,
            'embedding_provider': item.embedding_provider,
            'embedding_model': item.embedding_model,
            'content_type': item.content_type,
            'chunk_count': DocumentService._chunk_count(item.id),
            'created_at': item.created_at,
        }

    @staticmethod
    def _chunk_count(document_id: int) -> int | None:
        path = DocumentService._index_json_path(document_id)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
            total = data.get('total_chunks')
            if isinstance(total, int):
                return total
            chunks = data.get('chunks')
            return len(chunks) if isinstance(chunks, list) else None
        except (json.JSONDecodeError, OSError, ValueError):
            return None

    @staticmethod
    def _index_json_path(document_id: int) -> Path:
        return Path(settings.index_dir) / f'document_{document_id}.json'

    @staticmethod
    def _delete_chroma_vectors(document_id: int, doc: Document | None = None) -> None:
        collection = ChromaService.collection()
        collection.delete(where={'document_id': {'$eq': str(document_id)}})
        stored_provider = getattr(doc, 'embedding_provider', None) if doc is not None else None
        stored_model = getattr(doc, 'embedding_model', None) if doc is not None else None
        if stored_provider and stored_model:
            active_name = ChromaService._collection_name()
            stored_name = ChromaService._collection_name(stored_provider, stored_model)
            if stored_name != active_name:
                ChromaService.collection(stored_provider, stored_model).delete(
                    where={'document_id': {'$eq': str(document_id)}}
                )

    @staticmethod
    def _unlink_if_exists(path: Path) -> None:
        try:
            if path.exists() and path.is_file():
                path.unlink()
        except OSError as exc:
            raise ValueError(f'Falha ao remover arquivo {path.name}.') from exc

    @staticmethod
    def delete_document(db: Session, document_id: int) -> dict:
        """Remove documento, vetores do Chroma, JSON de índice e arquivo físico.

        Arquivo físico/JSON ausentes são tolerados para limpar estados
        parcialmente quebrados. Falha ao apagar vetores no Chroma aborta a
        exclusão para evitar documento fantasma no índice vetorial.
        """
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            raise HTTPException(status_code=404, detail='Documento não encontrado.')

        response = {
            'id': doc.id,
            'filename': doc.filename,
            'deleted': True,
        }

        try:
            DocumentService._delete_chroma_vectors(doc.id, doc)
            DocumentService._unlink_if_exists(DocumentService._index_json_path(doc.id))
            DocumentService._unlink_if_exists(Path(doc.path))
            db.delete(doc)
            db.commit()
            return response
        except HTTPException:
            raise
        except VectorStoreUnavailable as exc:
            try:
                db.rollback()
            except Exception:
                pass
            raise HTTPException(
                status_code=503,
                detail='Chroma indisponível. Não foi possível remover os vetores do documento agora.',
            ) from exc
        except Exception as exc:
            try:
                db.rollback()
            except Exception:
                pass
            logger.error('Falha ao excluir documento %d: %s', document_id, exc, exc_info=True)
            raise HTTPException(
                status_code=500,
                detail='Não foi possível excluir o documento.',
            ) from exc
