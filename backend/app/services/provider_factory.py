from app.providers.anthropic_provider import AnthropicProvider
from app.providers.base import ProviderCapabilityError, ProviderConfigurationError
from app.providers.deepseek_provider import DeepSeekProvider
from app.providers.google_provider import GoogleProvider
from app.providers.ollama_provider import OllamaProvider
from app.providers.openai_provider import OpenAIProvider
from app.providers.registry import get_provider_definition
from app.services import runtime_settings


class ProviderFactory:
    @staticmethod
    def create_for_rag(name: str, model: str | None = None, transport=None):
        """Cria o servidor global somente se ele suportar embeddings."""
        try:
            definition = get_provider_definition(name)
        except ValueError as exc:
            raise ProviderConfigurationError(str(exc)) from exc
        if not definition.supports_embeddings:
            raise ProviderCapabilityError(
                f'{definition.label} não oferece embeddings; selecione um provedor compatível para o RAG completo.'
            )
        # Sem keyword extra aqui para manter doubles de teste e integrações
        # locais compatíveis com o contrato original da fábrica.
        if model is None and transport is None:
            return ProviderFactory.create(name)
        return ProviderFactory.create(name, model=model, transport=transport)

    @staticmethod
    def create(name: str, model: str | None = None, transport=None, require_embeddings: bool = False):
        try:
            definition = get_provider_definition(name)
        except ValueError as exc:
            raise ProviderConfigurationError(str(exc)) from exc

        selected_model = (model or runtime_settings.get_value(definition.model_key) or definition.default_model).strip()
        if not selected_model:
            raise ProviderConfigurationError(f'Modelo não configurado para {definition.label}.')
        if require_embeddings and not definition.supports_embeddings:
            raise ProviderCapabilityError(
                f'{definition.label} não oferece embeddings; selecione um provedor compatível para o RAG completo.'
            )

        if definition.id == 'ollama':
            return OllamaProvider(
                model=selected_model,
                embedding_model=runtime_settings.get_provider_embedding_model(definition.id),
                transport=transport,
            )

        api_key = runtime_settings.get_value(definition.api_key_key or '').strip()
        if not api_key:
            raise ProviderConfigurationError(f'Configure a chave de API de {definition.label} antes de usar o provedor.')

        kwargs = {
            'api_key': api_key,
            'model': selected_model,
            'transport': transport,
        }
        if definition.id == 'openai':
            kwargs['embedding_model'] = runtime_settings.get_provider_embedding_model(definition.id)
            return OpenAIProvider(**kwargs)
        if definition.id == 'anthropic':
            return AnthropicProvider(**kwargs)
        if definition.id == 'google':
            kwargs['embedding_model'] = runtime_settings.get_provider_embedding_model(definition.id)
            return GoogleProvider(**kwargs)
        if definition.id == 'deepseek':
            kwargs['embedding_model'] = runtime_settings.get_provider_embedding_model(definition.id)
            return DeepSeekProvider(**kwargs)
        raise ProviderConfigurationError(f'Provedor não implementado: {definition.id}.')
