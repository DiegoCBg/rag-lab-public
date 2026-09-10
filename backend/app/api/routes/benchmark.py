from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.providers.base import ProviderError
from app.schemas.benchmark import BenchmarkCompareRequest, BenchmarkCompareResponse, BenchmarkRequest, BenchmarkResponse
from app.services import runtime_settings
from app.services.benchmark_service import BenchmarkService
from app.services.chroma_service import VectorStoreUnavailable

router = APIRouter()

@router.post('/run', response_model=BenchmarkResponse)
async def run_benchmark(payload: BenchmarkRequest, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    try:
        return await BenchmarkService.run(
            db,
            payload.model_copy(update={'provider': runtime_settings.get_active_provider()}),
        )
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

@router.post('/compare', response_model=BenchmarkCompareResponse)
async def compare_benchmark(payload: BenchmarkCompareRequest, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    try:
        return await BenchmarkService.compare(
            db,
            payload.model_copy(update={'provider': runtime_settings.get_active_provider()}),
        )
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
