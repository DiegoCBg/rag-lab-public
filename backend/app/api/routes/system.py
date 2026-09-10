from time import perf_counter, time

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.document import Document
from app.services.chroma_service import ChromaService, VectorStoreUnavailable
from app.services.document_service import STATE_FAILED, STATE_INDEXED, STATE_PROCESSING, STATE_UPLOADED
from app.services.runtime_settings import (
    get_active_provider,
    get_ollama_base_url,
    get_ollama_model,
    get_provider_embedding_model,
    get_provider_model,
)

router = APIRouter()
_CACHE = {'expires': 0.0, 'payload': None}


def clear_system_status_cache() -> None:
    _CACHE['expires'] = 0.0
    _CACHE['payload'] = None


def _latency_ms(started: float) -> float:
    return round((perf_counter() - started) * 1000, 2)


@router.get('/status')
def system_status(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    now = time()
    if _CACHE['payload'] and _CACHE['expires'] > now:
        return _CACHE['payload']

    fastapi_started = perf_counter()
    fastapi = {'status': 'ok', 'latency_ms': _latency_ms(fastapi_started), 'app': settings.app_name}

    ollama_started = perf_counter()
    ollama_base_url = get_ollama_base_url()
    ollama = {'status': 'unknown', 'model': get_ollama_model(), 'latency_ms': None, 'error': None}
    try:
        response = httpx.get(f'{ollama_base_url}/api/tags', timeout=1.5)
        ollama['status'] = 'ok' if response.status_code < 500 else 'error'
    except Exception as exc:
        ollama['status'] = 'error'
        ollama['error'] = exc.__class__.__name__
    ollama['latency_ms'] = _latency_ms(ollama_started)

    chroma_started = perf_counter()
    chroma = {'status': 'unknown', 'vector_count': 0, 'latency_ms': None, 'error': None}
    try:
        ChromaService.heartbeat()
        chroma['vector_count'] = ChromaService.safe_count()
        chroma['status'] = 'ok'
    except VectorStoreUnavailable:
        chroma['status'] = 'error'
        chroma['vector_count'] = 0
        chroma['error'] = 'vector_store_unavailable'
    except Exception:
        chroma['status'] = 'error'
        chroma['vector_count'] = 0
        chroma['error'] = 'vector_store_unavailable'
    chroma['latency_ms'] = _latency_ms(chroma_started)

    rows = db.query(Document.status).all()
    by_status = {STATE_UPLOADED: 0, STATE_PROCESSING: 0, STATE_INDEXED: 0, STATE_FAILED: 0}
    for (status,) in rows:
        by_status[status] = by_status.get(status, 0) + 1
    active_provider = get_active_provider()
    active_embedding_model = get_provider_embedding_model(active_provider)
    reindex_required = db.query(Document).filter(
        Document.status == STATE_INDEXED,
        (Document.embedding_provider != active_provider) | (Document.embedding_model != active_embedding_model),
    ).count()
    documents = {
        'total': len(rows),
        'by_status': by_status,
        'indexed': by_status.get(STATE_INDEXED, 0),
        'active_provider': active_provider,
        'active_model': get_provider_model(active_provider),
        'active_embedding_model': active_embedding_model,
        'reindex_required': reindex_required,
    }

    payload = {
        'fastapi': fastapi,
        'ollama': ollama,
        'chroma': chroma,
        'documents': documents,
    }
    _CACHE['payload'] = payload
    _CACHE['expires'] = now + 5
    return payload
