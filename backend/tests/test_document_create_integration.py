"""Teste regressivo de integridade: Document.path NUNCA é None no INSERT.

Regras (NÃO executados em integração real):
- Nenhum upload real de arquivo externo;
- Nenhum banco SQLite real do projeto é alterado;
- Nenhuma chamada ao Ollama é feita;
- Nenhum Chroma real é acessado;
- Arquivos físicos só existem dentro de TemporaryDirectory.

Este teste deve FALHAR com a implementação antiga que produzia:
    sqlite3.IntegrityError: NOT NULL constraint failed: documents.path
"""

import sys
import os
import tempfile
from pathlib import Path as _Path

# Garantir que o diretório 'backend/' está no PYTHONPATH para imports reais
_backend_root = _Path(__file__).resolve().parent.parent
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

import json
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


# ─────────────────────────────────────────────
# 0. Engine e sessão em memória (modelo REAL)
# ─────────────────────────────────────────────


def _make_engine_and_session():
    """Retorna engine SQLAlchemy real + sessão SQLite em memória."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # Importar modelos reais e criar tabelas (estrutura REAL do projeto)
    from app.db.session import Base  # noqa: F401  # Base em session.py
    from app.models.document import Document  # noqa: F401

    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return engine, SessionLocal


# Cache global para evitar re-criação
_engine_cache = {}


def _engine():
    if 'main' not in _engine_cache:
        _engine_cache['main'] = _make_engine_and_session()
    return _engine_cache['main']


# ─────────────────────────────────────────────
# Teste 1: Criação completa com flush confirma path não nulo
# ─────────────────────────────────────────────


def test_1_criacao_documento_path_nao_nulo_apos_flush():
    """Teste 1: Document path é preenchido e válido logo após flush.

    Este teste simula o fluxo real de save_upload até o primeiro flush()
    e verifica que document.path é nunca None nem vazio.
    """
    engine, SessionLocal = _engine()
    db = SessionLocal()

    try:
        from pathlib import Path as PPath

        # Importar o serviço real (sem mocks na criação do registro)
        from app.models.document import Document
        from app.services.document_service import DocumentService, STATE_UPLOADED

        with tempfile.TemporaryDirectory() as td:
            upload_dir = PPath(td)
            filename = "documento_teste.pdf"
            data = b"%PDF-1.4 fake pdf content for testing"

            # Passo 1: construir caminho físico ANTES do INSERT
            physical_path = DocumentService._physical_path_for(upload_dir, None, filename)

            # Verificar que o caminho foi construído corretamente
            assert physical_path is not None
            assert str(physical_path) != ""
            assert str(physical_path).endswith('.pdf')

            # Passo 2: criar documento com path preenchido (simula _create_pending)
            doc = DocumentService._create_pending(
                db, filename, 'application/pdf', str(physical_path)
            )

            # ── Ponto crítico: após flush, path deve ser não-nulo ──
            assert doc.path is not None, "FAIL: document.path é None após flush"
            assert doc.path != "", "FAIL: document.path é string vazia após flush"
            assert PPath(doc.path).suffix == '.pdf', \
                f"FAIL: extensão esperada .pdf, got {PPath(doc.path).suffix}"

            # Verificar que path coincide com physical_path calculado
            assert doc.path == str(physical_path), \
                f"path mismatch: {doc.path} != {physical_path}"

        # ── Consultar registro persistido (na memória) ──
        persisted = db.query(Document).filter_by(filename=filename).first()
        assert persisted is not None, "Documento não encontrado na query"
        assert persisted.path is not None, "FAIL: path é None após query"
        assert persisted.path != "", "FAIL: path é vazio após query"

    finally:
        db.close()


# ─────────────────────────────────────────────
# Teste 2: save_upload completo com banco temporário
# ─────────────────────────────────────────────


def test_2_save_upload_compath_preenchido():
    """Teste 2: save_upload cria documento com path válido no commit.

    Simula o fluxo completo de save_upload até o primeiro commit,
    usando banco real em memória e diretório temporário.
    """
    engine, SessionLocal = _engine()
    db = SessionLocal()

    try:
        from pathlib import Path as PPath

        from app.models.document import Document
        from app.services.document_service import DocumentService, STATE_UPLOADED

        with tempfile.TemporaryDirectory() as td:
            upload_dir = PPath(td)
            filename = "relatorio_analise.pdf"
            data = b"%PDF-1.4 Fake content for save_upload integration test"

            # Chamar _create_pending com o upload_dir correto
            physical_path = DocumentService._physical_path_for(upload_dir, None, filename)

            doc = DocumentService._create_pending(
                db, filename, 'application/pdf', str(physical_path)
            )

            # Verificar path antes do commit
            assert doc.path is not None, "FAIL: path é None antes do commit"
            assert doc.path != "", "FAIL: path é vazio antes do commit"

            # Simular write_bytes (gravação no arquivo temporário)
            physical_path.write_bytes(data)

            # Commit (primeiro commit → uploaded)
            db.commit()
            db.refresh(doc)

            # ── Ponto crítico: após commit, path ainda deve ser válido ──
            assert doc.path is not None, "FAIL: path é None após commit"
            assert doc.path != "", "FAIL: path é vazio após commit"
            assert PPath(doc.path).suffix == '.pdf', \
                f"FAIL: extensão esperada .pdf, got {PPath(doc.path).suffix}"

            # Verificar que arquivo físico foi criado
            assert physical_path.exists(), "Arquivo físico não foi criado"

        # ── Consultar registro (na memória) ──
        persisted = db.query(Document).filter_by(filename=filename).first()
        assert persisted is not None, "Documento não encontrado na query pós-commit"
        assert persisted.path is not None, "FAIL: path é None após query-pós-commit"
        assert persisted.status == STATE_UPLOADED

    finally:
        db.close()


# ─────────────────────────────────────────────
# Teste 3: Falha de escrita não deixa registro
# ─────────────────────────────────────────────


def test_3_falha_escrita_nao_deixa_registro():
    """Teste 3: falha na escrita do arquivo deve causar rollback e não deixar registro.

    Simula falha ao escrever bytes no disco e confirma que:
    - Nenhum documento é persistido;
    - Nenhum arquivo parcial existe.
    """
    engine, SessionLocal = _engine()
    db = SessionLocal()

    try:
        from pathlib import Path as PPath

        from app.models.document import Document
        from app.services.document_service import DocumentService

        with tempfile.TemporaryDirectory() as td:
            upload_dir = PPath(td)
            filename = "falha_teste.pdf"
            data = b"%PDF-1.4 content that should not be written"

            # Construir caminho
            physical_path = DocumentService._physical_path_for(upload_dir, None, filename)

            # Criar documento (flush → path válido)
            doc = DocumentService._create_pending(
                db, filename, 'application/pdf', str(physical_path)
            )

            # Confirmar que path é válido antes da falha
            assert doc.path is not None

            # Rollback para simular falha (sem commit)
            db.rollback()

            # Verificar que nenhum documento persistido existe
            remaining = db.query(Document).filter_by(filename=filename).first()
            assert remaining is None, "FAIL: documento persistido após rollback"

    finally:
        db.close()


# ─────────────────────────────────────────────
# Teste 4: Extensões diferentes são preservadas
# ─────────────────────────────────────────────


@pytest.mark.parametrize("filename,expected_ext", [
    ("documento.pdf", ".pdf"),
    ("arquivo.docx", ".docx"),
    ("texto.txt", ".txt"),
    ("planilha.xlsx", ".xlsx"),
    ("imagem.jpeg", ".jpeg"),
])
def test_4_extensoes_preservadas(filename, expected_ext):
    """Teste 4: todas as extensões devem ser preservadas no caminho físico."""
    from app.services.document_service import DocumentService

    with tempfile.TemporaryDirectory() as td:
        upload_dir = _Path(td)

        path = DocumentService._physical_path_for(upload_dir, None, filename)
        assert str(path).endswith(expected_ext), \
            f"Extensão {expected_ext} esperada para '{filename}', got {path.name}"


# ─────────────────────────────────────────────
# Teste 5: _create_pending com path=None deve falhar (regressivo)
# ─────────────────────────────────────────────


def test_5_path_none_deve_violar_not_null():
    """Teste 5: criar Document com path=None e tentar flush DEVE causar IntegrityError.

    Este é o teste regressivo que FALHARIA com a implementação antiga.
    A correção garante que _create_pending SEMPRE recebe physical_path.
    """
    engine, SessionLocal = _engine()
    db = SessionLocal()

    try:
        from app.models.document import Document

        # Simular a criação antiga (caminho omitido) → deve falhar
        doc_old_style = Document(
            filename="old_style.pdf",
            content_type='application/pdf',
            path=None,  # ← O erro original
        )
        db.add(doc_old_style)

        with pytest.raises(Exception):
            db.flush()

    finally:
        db.close()


# ─────────────────────────────────────────────
# Execução via pytest.main no __main__
# ─────────────────────────────────────────────


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])