from time import perf_counter

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies.auth import get_current_user
from app.providers.base import ProviderError
from app.providers.registry import PROVIDER_DEFINITIONS, provider_options
from app.services import runtime_settings
from app.services.provider_factory import ProviderFactory
from app.services.runtime_settings import get_active_provider, get_provider_embedding_model, get_provider_model

router = APIRouter()

@router.get('', include_in_schema=False)
@router.get('/')
def list_providers(_user=Depends(get_current_user)):
    options = []
    for item in provider_options():
        definition = PROVIDER_DEFINITIONS[item['id']]
        model = get_provider_model(definition.id)
        configured = bool(model.strip()) and (
            definition.api_key_key is None
            or bool(runtime_settings.get_value(definition.api_key_key).strip())
        )
        supports_embeddings = definition.supports_embeddings
        options.append({
            **item,
            'selected_model': model,
            'embedding_model': get_provider_embedding_model(definition.id),
            'configured': configured,
            'supports_embeddings': supports_embeddings,
            'active': definition.id == get_active_provider(),
            'can_use': configured and supports_embeddings,
            'unavailable_reason': (
                None
                if supports_embeddings
                else 'Este provedor não oferece embeddings para o RAG completo.'
            ),
        })
    return options


@router.post('/{provider_id}/test')
async def test_provider(provider_id: str, _user=Depends(get_current_user)):
    started = perf_counter()
    try:
        provider = ProviderFactory.create(provider_id)
        await provider.test()
    except ProviderError as exc:
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail={'code': exc.code, 'message': str(exc)},
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={'code': 'provider_test_failed', 'message': 'Falha ao testar o provedor.'},
        ) from exc
    definition = PROVIDER_DEFINITIONS.get(provider_id.lower())
    model = (getattr(provider, 'model', None) or get_provider_model(definition.id)) if definition else ''
    return {
        'provider': provider_id.lower(),
        'ok': True,
        'model': model,
        'latency_ms': round((perf_counter() - started) * 1000, 2),
    }
