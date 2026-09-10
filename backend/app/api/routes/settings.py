from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.api.routes.system import clear_system_status_cache
from app.schemas.settings import SettingsPatchRequest, SettingsPatchResponse
from app.providers.registry import get_provider_definition
from app.services.settings_service import EDITABLE_KEYS, SECRET_KEYS, SettingsService, _mask

router = APIRouter(prefix='/settings', tags=['settings'])


@router.get('', response_model=SettingsPatchResponse)
def get_settings(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return SettingsPatchResponse(items=SettingsService.snapshot(db))


@router.patch('', response_model=SettingsPatchResponse)
def patch_settings(
    payload: SettingsPatchRequest,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bad = [k for k in payload.items if k not in EDITABLE_KEYS]
    if bad:
        raise HTTPException(status_code=400, detail=f'not editable: {", ".join(bad)}')

    stored = SettingsService.all_items(db)
    generation_keys = {
        'default_chat_provider',
        'ollama_base_url',
        'ollama_model',
        'openai_api_key',
        'openai_model',
        'anthropic_api_key',
        'anthropic_model',
        'google_api_key',
        'google_model',
        'deepseek_api_key',
        'deepseek_model',
    }
    requested_provider = payload.items.get('default_chat_provider')
    if requested_provider:
        try:
            definition = get_provider_definition(requested_provider)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if not definition.supports_embeddings:
            raise HTTPException(
                status_code=409,
                detail='O provedor selecionado não oferece embeddings para o RAG completo.',
            )
        requested_model = payload.items.get(definition.model_key) or stored.get(definition.model_key)
        requested_key = payload.items.get(definition.api_key_key) if definition.api_key_key else 'local'
        if definition.api_key_key:
            requested_key = requested_key or stored.get(definition.api_key_key)
        if not str(requested_model or '').strip() or not str(requested_key or '').strip():
            raise HTTPException(
                status_code=409,
                detail='Configure o modelo e a chave do provedor antes de torná-lo o provedor ativo.',
            )
    changed_generation = False
    for key, value in payload.items.items():
        applied = value
        if value is None:
            SettingsService.delete_value(db, key)
            continue
        if key in stored:
            current_env = stored[key]
        else:
            from app.core.config import settings as cfg
            current_env = getattr(cfg, key, '') or ''
        # Se o valor atual veio do DB e o usuário enviou a máscara, mantém o original.
        if key in SECRET_KEYS:
            masked = _mask(stored.get(key, current_env))
            if value == masked and value not in (None, ''):
                applied = stored.get(key, current_env)
        if key in generation_keys and str(applied) != str(stored.get(key, current_env)):
            changed_generation = True
        SettingsService.set_value(db, key, applied)

    clear_system_status_cache()
    return SettingsPatchResponse(items=SettingsService.snapshot(db))
