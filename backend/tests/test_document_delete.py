from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base
from app.models.document import Document
from app.services.document_service import DocumentService


def _session():
    engine = create_engine(
        'sqlite:///:memory:',
        connect_args={'check_same_thread': False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_delete_document_removes_db_file_index_and_chroma(tmp_path):
    db = _session()
    upload = tmp_path / 'upload.txt'
    upload.write_text('conteudo', encoding='utf-8')
    index_dir = tmp_path / 'indexes'
    index_dir.mkdir()
    index_json = index_dir / 'document_1.json'
    index_json.write_text('{}', encoding='utf-8')
    doc = Document(id=1, filename='upload.txt', content_type='text/plain', path=str(upload), status='indexed')
    db.add(doc)
    db.commit()

    collection = MagicMock()
    with (
        patch('app.services.document_service.ChromaService.collection', return_value=collection),
        patch('app.services.document_service.settings.index_dir', str(index_dir)),
    ):
        result = DocumentService.delete_document(db, 1)

    assert result == {'id': 1, 'filename': 'upload.txt', 'deleted': True}
    collection.delete.assert_called_once_with(where={'document_id': {'$eq': '1'}})
    assert db.query(Document).filter_by(id=1).first() is None
    assert not upload.exists()
    assert not index_json.exists()


def test_delete_document_404_when_missing():
    db = _session()
    with pytest.raises(HTTPException) as exc:
        DocumentService.delete_document(db, 999)
    assert exc.value.status_code == 404


def test_delete_document_keeps_db_row_when_chroma_delete_fails(tmp_path):
    db = _session()
    upload = tmp_path / 'upload.txt'
    upload.write_text('conteudo', encoding='utf-8')
    doc = Document(id=1, filename='upload.txt', content_type='text/plain', path=str(upload), status='indexed')
    db.add(doc)
    db.commit()

    collection = MagicMock()
    collection.delete.side_effect = RuntimeError('chroma indisponivel')
    with (
        patch('app.services.document_service.ChromaService.collection', return_value=collection),
    ):
        with pytest.raises(HTTPException) as exc:
            DocumentService.delete_document(db, 1)

    assert exc.value.status_code == 500
    assert db.query(Document).filter_by(id=1).first() is not None
    assert upload.exists()
