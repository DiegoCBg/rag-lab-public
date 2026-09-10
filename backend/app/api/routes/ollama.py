from time import perf_counter

from fastapi import APIRouter, Depends, HTTPException
from httpx import AsyncClient, HTTPError
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.services.runtime_settings import get_ollama_base_url, get_ollama_model

router = APIRouter(prefix='/ollama', tags=['ollama'])


def _latency_ms(started: float) -> float:
    return round((perf_counter() - started) * 1000, 2)


@router.get('/models')
async def list_models(_: User = Depends(get_current_user)):
    base_url = get_ollama_base_url()
    started = perf_counter()
    try:
        async with AsyncClient(timeout=3) as client:
            response = await client.get(f'{base_url}/api/tags')
    except HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f'Ollama indisponível em {base_url}: {type(exc).__name__}',
        ) from exc
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f'Ollama respondeu {response.status_code}')

    data = response.json()
    models = sorted(data.get('models', []), key=lambda m: m.get('name', ''))
    return {
        'base_url': base_url,
        'current': get_ollama_model(),
        'latency_ms': _latency_ms(started),
        'models': [
            {
                'name': m.get('name'),
                'size': m.get('size'),
                'modified_at': m.get('modified_at'),
            }
            for m in models
        ],
    }


@router.post('/test')
async def test_connection(_: User = Depends(get_current_user)):
    base_url = get_ollama_base_url()
    started = perf_counter()
    try:
        async with AsyncClient(timeout=3) as client:
            response = await client.get(f'{base_url}/api/tags')
    except HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f'Ollama indisponível em {base_url}: {type(exc).__name__}',
        ) from exc
    return {
        'ok': response.status_code == 200,
        'base_url': base_url,
        'model': get_ollama_model(),
        'latency_ms': _latency_ms(started),
        'status_code': response.status_code,
    }