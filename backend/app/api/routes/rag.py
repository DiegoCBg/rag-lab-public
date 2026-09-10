from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.providers.base import ProviderError
from app.rag.registry import STRATEGY_IDS, strategy_options
from app.schemas.rag import RAGQueryRequest, RAGQueryResponse, RAGRunRequest, RAGRunResponse
from app.services import runtime_settings
from app.services.chroma_service import VectorStoreUnavailable
from app.services.rag_run_service import RAGRunService
from app.services.rag_service import RAGService

router = APIRouter()


def _resolve_provider(value: str) -> str:
    # O provedor e o modelo sao configuracao global. O campo legado continua
    # aceito no payload, mas nao pode desviar uma operacao para outro servidor.
    return runtime_settings.get_active_provider()


def _resolve_strategy(value: str | None) -> str:
    if value and value.strip() and value.strip() in STRATEGY_IDS:
        return value.strip()
    return runtime_settings.get_value('default_rag_strategy') or 'hybrid'


@router.get('/strategies')
def list_strategies(_user=Depends(get_current_user)):
    return strategy_options()


@router.post('/query', response_model=RAGQueryResponse)
async def query(payload: RAGQueryRequest, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    resolved = payload.model_copy(
        update={'provider': _resolve_provider(payload.provider), 'strategy': _resolve_strategy(payload.strategy)},
    )
    try:
        return await RAGService.run_query(db, resolved)
    except ProviderError as exc:
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail={'code': exc.code, 'message': str(exc)},
        ) from exc
    except VectorStoreUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail={'code': 'vector_store_unavailable', 'message': str(exc)},
        ) from exc


@router.post('/runs', response_model=RAGRunResponse)
async def create_run(payload: RAGRunRequest, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    resolved = payload.model_copy(update={'provider': _resolve_provider(payload.provider)})
    try:
        return await RAGRunService.create_run(db, resolved)
    except ProviderError as exc:
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail={'code': exc.code, 'message': str(exc)},
        ) from exc
    except VectorStoreUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail={'code': 'vector_store_unavailable', 'message': str(exc)},
        ) from exc


@router.get('/runs/{run_id}', response_model=RAGRunResponse)
def get_run(run_id: str, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    run = RAGRunService.get_run(db, run_id)
    if not run:
        raise HTTPException(status_code=404, detail='Run não encontrado.')
    return run


@router.get('/runs/{run_id}/events')
def get_run_events(run_id: str, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    events = RAGRunService.get_events(db, run_id)
    if events is None:
        raise HTTPException(status_code=404, detail='Run não encontrado.')
    return events
