"""Cache em memória de config runtime (override do DB sobre o .env).

Os providers leem através de `get_value`, garantindo que mudanças feitas
pela UI valem imediatamente, sem reiniciar o backend.
"""
from app.core.config import settings

_CACHE: dict[str, str] = {}


def refresh(items: dict[str, str]):
    _CACHE.clear()
    _CACHE.update(items)


def get_value(key: str) -> str:
    if key in _CACHE:
        return _CACHE[key]
    return getattr(settings, key, '') or ''


def get_ollama_base_url() -> str:
    return get_value('ollama_base_url') or settings.ollama_base_url


def get_ollama_model() -> str:
    return get_value('ollama_model') or settings.ollama_model


def get_active_provider() -> str:
    return (get_value('default_chat_provider') or settings.default_chat_provider or 'ollama').strip().lower()


def get_provider_model(provider: str) -> str:
    from app.providers.registry import get_provider_definition

    try:
        definition = get_provider_definition(provider)
    except ValueError:
        # Mantém compatibilidade com doubles de teste; a fábrica continua
        # rejeitando qualquer provedor desconhecido antes de fazer requests.
        return get_value(f'{(provider or "").strip().lower()}_model')
    return get_value(definition.model_key) or definition.default_model


def get_provider_embedding_model(provider: str) -> str:
    from app.providers.registry import get_provider_definition

    definition = get_provider_definition(provider)
    if not definition.supports_embeddings or not definition.embedding_model_key:
        return ''
    return get_value(definition.embedding_model_key) or definition.default_embedding_model or ''


def get_provider_api_key(provider: str) -> str:
    from app.providers.registry import get_provider_definition

    definition = get_provider_definition(provider)
    if not definition.api_key_key:
        return ''
    return get_value(definition.api_key_key)


def get_ollama_generate_timeout_seconds() -> float:
    value = get_value('ollama_generate_timeout_seconds') or settings.ollama_generate_timeout_seconds
    try:
        return max(1.0, float(value))
    except (TypeError, ValueError):
        return float(settings.ollama_generate_timeout_seconds)


def get_ollama_context_tokens() -> int:
    value = get_value('ollama_context_tokens') or settings.ollama_context_tokens
    try:
        return max(4_096, min(131_072, int(value)))
    except (TypeError, ValueError):
        return int(settings.ollama_context_tokens)
