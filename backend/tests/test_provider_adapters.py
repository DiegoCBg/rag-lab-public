import asyncio
import json

import httpx
import pytest

from app.providers.anthropic_provider import AnthropicProvider
from app.providers.base import ProviderCapabilityError, ProviderConfigurationError, ProviderRequestError
from app.providers.deepseek_provider import DeepSeekProvider
from app.providers.google_provider import GoogleProvider
from app.providers.openai_provider import OpenAIProvider
from app.services import runtime_settings
from app.services.embedding_service import EmbeddingService
from app.services.provider_factory import ProviderFactory


def run(coro):
    return asyncio.run(coro)


@pytest.mark.parametrize(
    ('provider_cls', 'payload', 'expected_path'),
    [
        (OpenAIProvider, {'choices': [{'message': {'content': 'resposta'}}]}, '/v1/chat/completions'),
        (DeepSeekProvider, {'choices': [{'message': {'content': 'resposta'}}]}, '/chat/completions'),
        (AnthropicProvider, {'content': [{'type': 'text', 'text': 'resposta'}]}, '/v1/messages'),
        (GoogleProvider, {'candidates': [{'content': {'parts': [{'text': 'resposta'}]}}]}, '/v1beta/models/test-model:generateContent'),
    ],
)
def test_external_adapters_send_selected_model_and_return_text(provider_cls, payload, expected_path):
    captured = {}

    def handler(request):
        captured['request'] = request
        return httpx.Response(200, json=payload)

    provider = provider_cls(
        api_key='secret-key',
        model='test-model',
        transport=httpx.MockTransport(handler),
    )
    assert run(provider.chat('pergunta')) == 'resposta'
    request = captured['request']
    assert request.url.path == expected_path
    assert json.loads(request.content)['model'] == 'test-model' if provider_cls is not GoogleProvider else True
    if provider_cls is GoogleProvider:
        assert request.url.path.endswith('/test-model:generateContent')
        assert request.headers['x-goog-api-key'] == 'secret-key'
    elif provider_cls is AnthropicProvider:
        assert request.headers['x-api-key'] == 'secret-key'
    else:
        assert request.headers['authorization'] == 'Bearer secret-key'


@pytest.mark.parametrize('provider_id', ['openai', 'anthropic', 'google', 'deepseek'])
def test_factory_creates_real_external_provider(provider_id):
    runtime_settings.refresh({f'{provider_id}_api_key': 'test-key'})
    provider = ProviderFactory.create(provider_id, model='test-model', transport=httpx.MockTransport(lambda request: httpx.Response(200, json={})))
    assert not provider.__class__.__name__.lower().startswith('stub')
    assert provider.model == 'test-model'


def test_factory_rejects_external_provider_without_key():
    runtime_settings.refresh({'openai_api_key': ''})
    with pytest.raises(ProviderConfigurationError, match='chave de API'):
        ProviderFactory.create('openai')


def test_external_error_does_not_leak_key_or_prompt():
    secret = 'secret-key'
    prompt = 'documento confidencial e prompt secreto'

    def handler(request):
        return httpx.Response(401, json={'error': {'message': f'{secret} {prompt}'}})

    provider = OpenAIProvider(secret, 'test-model', transport=httpx.MockTransport(handler))
    with pytest.raises(ProviderRequestError) as exc_info:
        run(provider.chat(prompt))
    message = str(exc_info.value)
    assert secret not in message
    assert prompt not in message
    assert exc_info.value.code == 'provider_authentication_failed'


def test_generate_json_uses_structured_response():
    def handler(request):
        payload = json.loads(request.content)
        assert payload['response_format'] == {'type': 'json_object'}
        return httpx.Response(200, json={'choices': [{'message': {'content': '{"ok": true}'}}]})

    provider = OpenAIProvider('test-key', 'test-model', transport=httpx.MockTransport(handler))
    assert run(provider.generate_json('json')) == {'ok': True}


def test_openai_embeddings_use_configured_embedding_model():
    captured = {}

    def handler(request):
        captured['request'] = request
        return httpx.Response(200, json={
            'data': [
                {'index': 1, 'embedding': [0.2, 0.3]},
                {'index': 0, 'embedding': [0.1, 0.4]},
            ],
        })

    provider = OpenAIProvider(
        'test-key',
        'chat-model',
        embedding_model='embedding-model',
        transport=httpx.MockTransport(handler),
    )
    assert run(provider.embed(['um', 'dois'])) == [[0.1, 0.4], [0.2, 0.3]]
    body = json.loads(captured['request'].content)
    assert captured['request'].url.path == '/v1/embeddings'
    assert body['model'] == 'embedding-model'


def test_google_embeddings_use_configured_embedding_model():
    captured = {}

    def handler(request):
        captured['request'] = request
        return httpx.Response(200, json={'embeddings': [
            {'values': [0.1, 0.2]},
            {'values': [0.3, 0.4]},
        ]})

    provider = GoogleProvider(
        'test-key',
        'chat-model',
        embedding_model='embedding-model',
        transport=httpx.MockTransport(handler),
    )
    assert run(provider.embed(['um', 'dois'])) == [[0.1, 0.2], [0.3, 0.4]]
    body = json.loads(captured['request'].content)
    assert captured['request'].url.path.endswith('/embedding-model:batchEmbedContents')
    assert body['requests'][0]['model'] == 'models/embedding-model'


def test_providers_without_embeddings_cannot_run_full_rag():
    with pytest.raises(ProviderCapabilityError):
        ProviderFactory.create_for_rag('anthropic')


def test_embedding_service_uses_active_google_server(monkeypatch):
    calls = []

    class DummyProvider:
        async def embed(self, texts):
            calls.append(texts)
            return [[0.1, 0.2] for _ in texts]

    runtime_settings.refresh({'default_chat_provider': 'google'})
    monkeypatch.setattr(
        'app.services.embedding_service.ProviderFactory.create',
        lambda name, **kwargs: DummyProvider(),
    )
    assert run(EmbeddingService.embed(['texto'])) == [[0.1, 0.2]]
    assert calls == [['texto']]

