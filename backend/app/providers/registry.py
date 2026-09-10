from dataclasses import dataclass


@dataclass(frozen=True)
class ProviderDefinition:
    id: str
    label: str
    api_key_key: str | None
    model_key: str
    default_model: str
    suggested_models: tuple[str, ...] = ()
    supports_custom_model: bool = True
    embedding_model_key: str | None = None
    default_embedding_model: str | None = None
    supports_embeddings: bool = False


PROVIDER_DEFINITIONS = {
    'ollama': ProviderDefinition(
        id='ollama',
        label='Ollama (local)',
        api_key_key=None,
        model_key='ollama_model',
        default_model='llama3.1',
        embedding_model_key='ollama_embedding_model',
        default_embedding_model='nomic-embed-text',
        supports_embeddings=True,
    ),
    'openai': ProviderDefinition(
        id='openai',
        label='OpenAI API',
        api_key_key='openai_api_key',
        model_key='openai_model',
        default_model='gpt-5-mini',
        suggested_models=('gpt-5-mini', 'gpt-5', 'gpt-4.1-mini'),
        embedding_model_key='openai_embedding_model',
        default_embedding_model='text-embedding-3-small',
        supports_embeddings=True,
    ),
    'anthropic': ProviderDefinition(
        id='anthropic',
        label='Anthropic API',
        api_key_key='anthropic_api_key',
        model_key='anthropic_model',
        default_model='claude-sonnet-4-20250514',
        suggested_models=('claude-sonnet-4-20250514', 'claude-3-7-sonnet-latest'),
    ),
    'google': ProviderDefinition(
        id='google',
        label='Google API',
        api_key_key='google_api_key',
        model_key='google_model',
        default_model='gemini-3.5-flash',
        suggested_models=('gemini-3.5-flash', 'gemini-2.5-flash'),
        embedding_model_key='google_embedding_model',
        default_embedding_model='gemini-embedding-001',
        supports_embeddings=True,
    ),
    'deepseek': ProviderDefinition(
        id='deepseek',
        label='DeepSeek API',
        api_key_key='deepseek_api_key',
        model_key='deepseek_model',
        default_model='deepseek-v4-flash',
        suggested_models=('deepseek-v4-flash', 'deepseek-v4-pro'),
    ),
}


def get_provider_definition(provider_id: str) -> ProviderDefinition:
    try:
        return PROVIDER_DEFINITIONS[(provider_id or '').strip().lower()]
    except KeyError as exc:
        raise ValueError(f'Provedor desconhecido: {provider_id or "vazio"}.') from exc


def provider_options() -> list[dict]:
    return [
        {
            'id': definition.id,
            'label': definition.label,
            'api_key_key': definition.api_key_key,
            'model_key': definition.model_key,
            'embedding_model_key': definition.embedding_model_key,
            'embedding_model': definition.default_embedding_model,
            'supports_embeddings': definition.supports_embeddings,
            'models': [
                {'id': model, 'label': model}
                for model in definition.suggested_models
            ],
            'supports_custom_model': definition.supports_custom_model,
        }
        for definition in PROVIDER_DEFINITIONS.values()
    ]
