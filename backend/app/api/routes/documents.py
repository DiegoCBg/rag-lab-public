import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.document import Document
from app.schemas.document import DocumentDeleteResponse, DocumentResponse
from app.services.chroma_service import VectorStoreUnavailable
from app.services.document_service import DocumentService

router = APIRouter()
_UPLOAD_ERROR_MESSAGE = 'Não foi possível enviar e indexar o documento.'
_INGESTIONS: dict[str, dict] = {}
logger = logging.getLogger(__name__)


def _safe_upload_error(exc: Exception) -> HTTPException:
    logger.error('Falha no upload/indexação: %s', exc, exc_info=True)
    return HTTPException(status_code=500, detail=_UPLOAD_ERROR_MESSAGE)


def _job_payload(job_id: str, status: str, document: dict | None = None, error: str | None = None) -> dict:
    stage = 'completed' if status == 'completed' else 'failed' if status == 'failed' else 'embedding'
    progress = 100 if status == 'completed' else 0
    return {
        'job_id': job_id,
        'status': status,
        'stage': stage,
        'progress': progress,
        'document': document,
        'error': error,
        'steps': [
            {'stage': 'upload', 'status': 'completed', 'progress': 100},
            {'stage': 'extraction', 'status': 'completed' if status == 'completed' else status, 'progress': progress},
            {'stage': 'chunking', 'status': 'completed' if status == 'completed' else status, 'progress': progress},
            {'stage': 'embedding', 'status': 'completed' if status == 'completed' else status, 'progress': progress},
            {'stage': 'vector_write', 'status': 'completed' if status == 'completed' else status, 'progress': progress},
        ],
    }


@router.post('/upload', response_model=DocumentResponse)
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db), _user=Depends(get_current_user)):
    try:
        return await DocumentService.save_upload(db, file.filename, file.content_type, await file.read())
    except HTTPException:
        raise
    except Exception as exc:
        raise _safe_upload_error(exc) from exc


@router.post('/ingestions')
async def create_ingestion(file: UploadFile = File(...), db: Session = Depends(get_db), _user=Depends(get_current_user)):
    job_id = f'ing_{uuid.uuid4().hex[:12]}'
    _INGESTIONS[job_id] = _job_payload(job_id, 'running')
    try:
        document = await DocumentService.save_upload(db, file.filename, file.content_type, await file.read())
        payload = _job_payload(job_id, 'completed', DocumentService.serialize(document))
        _INGESTIONS[job_id] = payload
        return payload
    except HTTPException as exc:
        _INGESTIONS[job_id] = _job_payload(job_id, 'failed', error=str(exc.detail))
        raise
    except Exception as exc:
        _INGESTIONS[job_id] = _job_payload(job_id, 'failed', error=str(exc)[:500])
        raise _safe_upload_error(exc) from exc


@router.get('/ingestions/{job_id}')
def get_ingestion(job_id: str, _user=Depends(get_current_user)):
    payload = _INGESTIONS.get(job_id)
    if not payload:
        raise HTTPException(status_code=404, detail='Ingestão não encontrada.')
    return payload


@router.get('', response_model=list[DocumentResponse])
@router.get('/', response_model=list[DocumentResponse])
def list_documents(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    return DocumentService.list_documents(db)


@router.get('/{document_id}')
def get_document(document_id: int, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail='Documento não encontrado.')
    payload = DocumentService.serialize(doc)
    payload['path'] = doc.path
    payload['metadata_json'] = doc.metadata_json
    return payload


@router.post('/{document_id}/reindex')
async def reindex_document(document_id: int, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail='Documento não encontrado.')
    from app.services.index_service import IndexService
    try:
        doc.status = 'processing'
        db.commit()
        index_payload = await IndexService.build_for_document(doc)
        doc.embedding_provider = index_payload.get('embedding_provider')
        doc.embedding_model = index_payload.get('embedding_model')
        doc.status = 'indexed'
        db.commit()
        db.refresh(doc)
        return DocumentService.serialize(doc)
    except VectorStoreUnavailable as exc:
        raise HTTPException(status_code=503, detail='Chroma indisponível. Inicie o serviço vetorial e tente reindexar novamente.') from exc
    except Exception as exc:
        db.rollback()
        failed = db.query(Document).filter(Document.id == document_id).first()
        if failed:
            failed.status = 'failed'
            db.commit()
        raise HTTPException(status_code=500, detail='Não foi possível reindexar o documento.') from exc


@router.delete('/{document_id}', response_model=DocumentDeleteResponse)
def delete_document(document_id: int, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    try:
        return DocumentService.delete_document(db, document_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error('Falha ao excluir documento %s: %s', document_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail='Não foi possível excluir o documento.') from exc
