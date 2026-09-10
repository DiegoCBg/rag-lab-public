"""Testes mockados do fluxo de upload assíncrono.

Sem Ollama real, sem Chroma real, sem banco real: tudo fake/mock.
Regressivo contra o bug: IndexService.build_for_document era chamado
sem await (coroutine nunca executada → status falsamente 'indexed').
"""

import inspect
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.services.document_service import (
    STATE_FAILED,
    STATE_INDEXED,
    STATE_PROCESSING,
    DocumentService,
)


class _FakeQuery:
    def __init__(self, doc):
        self._doc = doc

    def filter_by(self, **kwargs):
        return self

    def one(self):
        return self._doc

    def count(self):
        return 1


class _FakeSession:
    def __init__(self):
        self.doc = None
        self.commits = 0
        self.rollbacks = 0
        self.refreshed = []

    def add(self, obj):
        self.doc = obj

    def flush(self):
        if self.doc is not None and getattr(self.doc, 'id', None) is None:
            self.doc.id = 1

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def refresh(self, obj):
        self.refreshed.append(obj)

    def query(self, model):
        return _FakeQuery(self.doc)


class _FakeFile:
    def __init__(self, data=b'%PDF-1.4 fake content'):
        self._data = data
        self.filename = 'doc.pdf'
        self.content_type = 'application/pdf'

    async def read(self):
        return self._data


@pytest.mark.asyncio
async def test_save_upload_e_async():
    """O método que inicia a indexação deve ser coroutine."""
    assert inspect.iscoroutinefunction(DocumentService.save_upload)


@pytest.mark.asyncio
async def test_save_upload_aguarda_build_exatamente_uma_vez(monkeypatch, tmp_path):
    """build_for_document é aguardado exatamente uma vez e sucesso → indexed."""
    monkeypatch.setattr('app.services.document_service.settings.upload_dir', str(tmp_path))
    build = AsyncMock(return_value={'document_id': 1, 'total_chunks': 2})
    monkeypatch.setattr('app.services.document_service.IndexService.build_for_document', build)
    db = _FakeSession()

    doc = await DocumentService.save_upload(db, 'litografia.pdf', 'application/pdf', b'data')

    build.assert_awaited_once()
    assert doc.status == STATE_INDEXED
    assert doc.id == 1


@pytest.mark.asyncio
async def test_status_processing_durante_indexacao(monkeypatch, tmp_path):
    """Enquanto a indexação roda, o status é 'processing', nunca 'indexed'."""
    monkeypatch.setattr('app.services.document_service.settings.upload_dir', str(tmp_path))

    async def assert_processing(doc):
        assert doc.status == STATE_PROCESSING
        return {'document_id': doc.id, 'total_chunks': 1}

    build = AsyncMock(side_effect=assert_processing)
    monkeypatch.setattr('app.services.document_service.IndexService.build_for_document', build)
    db = _FakeSession()

    doc = await DocumentService.save_upload(db, 'doc.pdf', 'application/pdf', b'data')

    build.assert_awaited_once()
    assert doc.status == STATE_INDEXED


@pytest.mark.asyncio
async def test_excecao_na_indexacao_marca_failed(monkeypatch, tmp_path):
    """Exceção na indexação → status 'failed' e HTTPException 500."""
    monkeypatch.setattr('app.services.document_service.settings.upload_dir', str(tmp_path))
    build = AsyncMock(side_effect=ValueError('falha simulada'))
    monkeypatch.setattr('app.services.document_service.IndexService.build_for_document', build)
    db = _FakeSession()

    with pytest.raises(HTTPException) as excinfo:
        await DocumentService.save_upload(db, 'doc.pdf', 'application/pdf', b'data')

    assert excinfo.value.status_code == 500
    build.assert_awaited_once()
    assert db.doc.status == STATE_FAILED
    assert db.rollbacks >= 1


@pytest.mark.asyncio
async def test_rota_aguarda_save_upload(monkeypatch):
    """A rota FastAPI aguarda o DocumentService.save_upload."""
    from app.api.routes.documents import upload_document

    expected = MagicMock(id=9, status='indexed')
    svc = AsyncMock(return_value=expected)
    monkeypatch.setattr('app.api.routes.documents.DocumentService.save_upload', svc)
    db = _FakeSession()
    file = _FakeFile()

    result = await upload_document(file=file, db=db, _user=None)

    svc.assert_awaited_once()
    assert result is expected
