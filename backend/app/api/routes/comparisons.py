from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.providers.base import ProviderError
from app.schemas.comparison import ComparisonRunRequest
from app.services.chroma_service import VectorStoreUnavailable
from app.services.comparison_service import (
    ComparisonGroupNotFoundError,
    ComparisonGroupRunningError,
    ComparisonNoDocumentsError,
    ComparisonService,
)
from app.services import runtime_settings
from app.services.markdown_reporter import build_markdown
from app.services.runtime_settings import get_provider_embedding_model

router = APIRouter()


@router.post('', response_model=dict, include_in_schema=False)
@router.post('/', response_model=dict)
async def run_comparison(
    payload: ComparisonRunRequest,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    try:
        return await ComparisonService.run_comparison(
            db,
            question=payload.question,
            strategies=payload.strategies,
            provider=runtime_settings.get_active_provider(),
            locale=payload.locale,
            content_type_filter=payload.content_type_filter,
            status_filter=payload.status_filter,
            top_k=payload.top_k,
            document_scope=payload.document_scope,
            document_ids=payload.document_ids,
)
    except ComparisonNoDocumentsError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
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


@router.get('', response_model=list, include_in_schema=False)
@router.get('/', response_model=list)
def list_groups(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    return ComparisonService.list_groups(db)


@router.get('/{group_id}.md', response_class=PlainTextResponse)
def markdown_report(
    group_id: str,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    group = ComparisonService.get_group(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail='Grupo de comparação não encontrado.')

    analyses = {
        execution['strategy']: execution.get('analysis') or {}
        for execution in group['executions']
    }
    provider = (
        group['executions'][0].get('provider', 'ollama')
        if group['executions'] else 'ollama'
    )
    return PlainTextResponse(build_markdown(
        group_id=group_id,
        created_at=group['created_at'] or '',
        question=group['question'],
        documents=group['documents'],
        provider=provider,
        generation_model=(
            group['executions'][0].get('generation_model', '')
            if group['executions'] else ''
        ),
        embedding_model=get_provider_embedding_model(provider),
        executions=group['executions'],
        analyses=analyses,
        comparison=group['comparison'] or {},
    ), media_type='text/markdown')


@router.get('/{group_id}', response_model=dict)
def get_group(
    group_id: str,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    group = ComparisonService.get_group(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail='Grupo de comparação não encontrado.')
    return group


@router.delete('/{group_id}', response_model=dict)
def delete_group(
    group_id: str,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    try:
        return ComparisonService.delete_group(db, group_id)
    except ComparisonGroupNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail='Grupo de comparação não encontrado.',
        ) from exc
    except ComparisonGroupRunningError as exc:
        raise HTTPException(
            status_code=409,
            detail='A comparação ainda está em execução e não pode ser excluída.',
        ) from exc
