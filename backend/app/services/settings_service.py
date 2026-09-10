from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.app_setting import AppSetting
from app.services import runtime_settings

# Chaves que podem ser alteradas em tempo de execução via UI.
EDITABLE_KEYS = {
    'ollama_base_url',
    'ollama_generate_timeout_seconds',
    'ollama_model',
    'ollama_embedding_model',
    'openai_api_key',
    'openai_model',
    'openai_embedding_model',
    'anthropic_api_key',
    'anthropic_model',
    'google_api_key',
    'google_model',
    'google_embedding_model',
    'deepseek_api_key',
    'deepseek_model',
    'default_chat_provider',
    'default_rag_strategy',
}

# Chaves cujo valor nunca deve ser exposto por completo em leituras.
SECRET_KEYS = {
    'openai_api_key',
    'anthropic_api_key',
    'google_api_key',
    'deepseek_api_key',
}


def _mask(value: str) -> str:
    if not value:
        return ''
    if len(value) <= 8:
        return '****'
    return f'{value[:4]}...{value[-4:]}'


class SettingsService:
    @staticmethod
    def get_value(db: Session, key: str) -> str | None:
        row = db.query(AppSetting).filter(AppSetting.key == key).first()
        if row:
            return row.value
        return getattr(settings, key, None)

    @staticmethod
    def refresh_cache(db: Session):
        runtime_settings.refresh(SettingsService.all_items(db))

    @staticmethod
    def set_value(db: Session, key: str, value: str):
        row = db.query(AppSetting).filter(AppSetting.key == key).first()
        if row:
            row.value = value
        else:
            db.add(AppSetting(key=key, value=value))
        db.commit()
        runtime_settings.refresh(SettingsService.all_items(db))

    @staticmethod
    def delete_value(db: Session, key: str):
        row = db.query(AppSetting).filter(AppSetting.key == key).first()
        if row:
            db.delete(row)
            db.commit()
        runtime_settings.refresh(SettingsService.all_items(db))

    @staticmethod
    def all_items(db: Session) -> dict:
        rows = db.query(AppSetting).all()
        return {row.key: row.value for row in rows}

    @staticmethod
    def snapshot(db: Session) -> list[dict]:
        """Visão para a UI: máscara segredos, expõe origem (env | db)."""
        stored = SettingsService.all_items(db)
        result = []
        for key in sorted(EDITABLE_KEYS):
            if key in stored:
                value = stored[key]
                source = 'db'
            else:
                value = getattr(settings, key, '') or ''
                source = 'env'
            shown_value = '' if value is None else str(value)
            shown = _mask(shown_value) if key in SECRET_KEYS else shown_value
            result.append({
                'key': key,
                'value': shown,
                'is_set': bool(shown_value),
                'is_secret': key in SECRET_KEYS,
                'source': source,
            })
        return result
