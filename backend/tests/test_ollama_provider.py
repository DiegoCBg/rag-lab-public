import asyncio
import json

import httpx
import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.providers.ollama_provider import OllamaProvider
from app.services import runtime_settings

SECRET_MARKER = 'CONTEUDO-SECRETO-NAO-DEVIA-VAZAR'


def _run_chat(prompt=SECRET_MARKER, transport=None):
    return asyncio.run(OllamaProvider(transport=transport).chat(prompt))


def test_chat_200_valid():
    captured = {}

    def handler(request):
        captured['url'] = str(request.url)
        captured['json'] = json.loads(request.content)
        return httpx.Response(200, json={'response': 'resposta mockada'})

    assert _run_chat('pergunta?', httpx.MockTransport(handler)) == 'resposta mockada'
    assert captured['url'].endswith('/api/generate')
    assert captured['url'].startswith(settings.ollama_base_url)
    assert captured['json']['prompt'] == 'pergunta?'


def test_chat_404_json_error():
    def handler(request):
        return httpx.Response(404, json={"error": "model 'modelo-x' not found"})

    with pytest.raises(HTTPException) as exc_info:
        _run_chat(transport=httpx.MockTransport(handler))
    assert exc_info.value.status_code == 502
    detail = str(exc_info.value.detail)
    assert '404' in detail
    assert settings.ollama_model in detail
    assert "model 'modelo-x' not found" in detail
    assert SECRET_MARKER not in detail


def test_chat_404_non_json_body():
    def handler(request):
        return httpx.Response(404, text='upstream: pagina nao encontrada')

    with pytest.raises(HTTPException) as exc_info:
        _run_chat(transport=httpx.MockTransport(handler))
    assert exc_info.value.status_code == 502
    detail = str(exc_info.value.detail)
    assert 'upstream: pagina nao encontrada' in detail
    assert SECRET_MARKER not in detail


def test_chat_timeout_controlled():
    def handler(request):
        raise httpx.ReadTimeout('Read timed out.', request=request)

    with pytest.raises(HTTPException) as exc_info:
        _run_chat(transport=httpx.MockTransport(handler))
    assert exc_info.value.status_code == 502
    detail = str(exc_info.value.detail)
    assert 'ReadTimeout' in detail
    assert settings.ollama_model in detail
    assert SECRET_MARKER not in detail


def test_chat_payload_model_stream_url():
    captured = {}

    def handler(request):
        captured['url'] = str(request.url)
        captured['json'] = json.loads(request.content)
        return httpx.Response(200, json={'response': 'ok'})

    _run_chat('pergunta?', httpx.MockTransport(handler))
    assert captured['json']['model'] == settings.ollama_model
    assert captured['json']['stream'] is False
    assert captured['json']['options']['num_ctx'] == settings.ollama_context_tokens
    assert captured['json']['prompt'] == 'pergunta?'
    assert captured['url'] == f'{settings.ollama_base_url}/api/generate'


def test_generate_json_uses_native_json_mode_without_thinking():
    captured = {}

    def handler(request):
        captured['json'] = json.loads(request.content)
        return httpx.Response(200, json={'response': '{"ok": true}'})

    provider = OllamaProvider(model='modelo-json', transport=httpx.MockTransport(handler))
    assert asyncio.run(provider.generate_json('retorne JSON')) == {'ok': True}
    assert captured['json']['model'] == 'modelo-json'
    assert captured['json']['format'] == 'json'
    assert captured['json']['think'] is False
    assert captured['json']['stream'] is False


def test_usage_aware_call_maps_ollama_counters():
    def handler(request):
        return httpx.Response(200, json={
            'response': 'resposta',
            'prompt_eval_count': 123,
            'eval_count': 45,
            'prompt_eval_duration': 1000,
            'eval_duration': 2000,
            'total_duration': 3000,
        })

    result = asyncio.run(OllamaProvider(model='modelo-uso', transport=httpx.MockTransport(handler)).chat_with_usage('pergunta'))
    assert result.text == 'resposta'
    assert result.usage['prompt_tokens'] == 123
    assert result.usage['output_tokens'] == 45
    assert result.usage['total_tokens'] == 168
    assert result.usage['known'] is True
    assert result.usage['model'] == 'modelo-uso'


def test_no_real_ollama_call():
    calls = []

    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(200, json={'response': 'ok'})

    _run_chat('pergunta?', httpx.MockTransport(handler))
    assert calls == [f'{settings.ollama_base_url}/api/generate']


def test_chat_uses_runtime_timeout(monkeypatch):
    captured = {}
    runtime_settings.refresh({'ollama_generate_timeout_seconds': '321'})

    class FakeResponse:
        status_code = 200

        def json(self):
            return {'response': 'ok'}

    class FakeClient:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, json):
            return FakeResponse()

    monkeypatch.setattr('app.providers.ollama_provider.httpx.AsyncClient', FakeClient)

    assert _run_chat('pergunta?') == 'ok'
    assert captured['timeout'] == 321.0


def test_chat_uses_runtime_context_limit(monkeypatch):
    captured = {}
    monkeypatch.setattr('app.providers.ollama_provider.get_ollama_context_tokens', lambda: 65_536)

    class FakeResponse:
        status_code = 200

        def json(self):
            return {'response': 'ok'}

    class FakeClient:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, json):
            captured['json'] = json
            return FakeResponse()

    monkeypatch.setattr('app.providers.ollama_provider.httpx.AsyncClient', FakeClient)

    assert _run_chat('pergunta?') == 'ok'
    assert captured['json']['options']['num_ctx'] == 65_536


def test_error_detail_never_leaks_prompt_or_chunks():
    def handler(request):
        return httpx.Response(404, json={"error": "model 'modelo-x' not found"})

    prompt = f'{SECRET_MARKER}\nTrechos recuperados: [documento confidencial 1]'
    with pytest.raises(HTTPException) as exc_info:
        _run_chat(prompt, httpx.MockTransport(handler))
    detail = str(exc_info.value.detail)
    assert SECRET_MARKER not in detail
    assert 'documento confidencial' not in detail
    assert 'Trechos recuperados' not in detail
