"""Reindexação de documentos existentes sem duplicar registros.

Uso: python scripts\\reindex_documents.py <id> [id ...]

Reutiliza o arquivo físico já armazenado, remove chunks obsoletos
do Chroma para o documento e executa a indexação completa de forma
bloqueante (aguardada), seguindo:
processing → indexed (sucesso) | failed (exceção).
"""

import asyncio
import sys
from pathlib import Path

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.document import Document
from app.services.chroma_service import ChromaService
from app.services.document_service import STATE_FAILED, STATE_INDEXED, STATE_PROCESSING
from app.services.index_service import IndexService


def _clean_stale_chunks(doc_id: int) -> int:
    collection = ChromaService.collection()
    existing = collection.get(where={'document_id': str(doc_id)})
    ids = existing.get('ids', []) if existing else []
    if ids:
        collection.delete(ids)
    return len(ids)


async def _reindex_one(db: Session, doc_id: int) -> None:
    doc = db.query(Document).filter(Document.id == doc_id).one()
    if not doc.path or not Path(doc.path).exists():
        raise FileNotFoundError(f'arquivo físico ausente para document_id={doc_id}: {doc.path}')

    removed = _clean_stale_chunks(doc_id)
    doc.status = STATE_PROCESSING
    db.commit()

    try:
        await IndexService.build_for_document(doc)
    except Exception as exc:
        db.rollback()
        failed = db.query(Document).filter(Document.id == doc_id).one()
        failed.status = STATE_FAILED
        db.commit()
        raise RuntimeError(f'indexação falhou para document_id={doc_id}: {exc}') from exc

    doc.status = STATE_INDEXED
    db.commit()
    print(f'document_id={doc_id} reindexado: status=indexed, chunks antigos removidos={removed}')


async def main() -> None:
    raw = sys.argv[1:]
    if not raw:
        print('Uso: python scripts\\reindex_documents.py <id> [id ...]')
        return

    ids = [int(x) for x in raw]
    db = SessionLocal()
    try:
        for doc_id in ids:
            try:
                await _reindex_one(db, doc_id)
            except Exception as exc:
                print(f'document_id={doc_id} FALHOU: {exc}')
                raise
    finally:
        db.close()


if __name__ == '__main__':
    asyncio.run(main())
