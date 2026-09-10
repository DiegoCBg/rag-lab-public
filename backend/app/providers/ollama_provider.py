import httpx
from fastapi import HTTPException
from app.providers.base import ChatProvider, GenerationResult, ProviderRequestError, normalize_usage, parse_json_text
from app.services.runtime_settings import (
    get_ollama_base_url,
    get_ollama_context_tokens,
    get_ollama_generate_timeout_seconds,
    get_ollama_model,
    get_provider_embedding_model,
)

_MAX_ERROR_BODY = 500


def _safe_error_detail(response: httpx.Response, model: str) -> str:
    body = ''
    try:
        data = response.json()
        if isinstance(data, dict) and data.get('error'):
            body = str(data['error'])
        else:
            body = response.text
    except ValueError:
        body = response.text
    body = (body or '').strip()[: _MAX_ERROR_BODY]
    return (
        f'Ollama respondeu {response.status_code} ao gerar com o modelo "{model}": '
        f'{body or "resposta vazia"}'
    )


class OllamaProvider(ChatProvider):
    def __init__(self, model: str | None = None, embedding_model: str | None = None, transport=None):
        self.model = model
        self.embedding_model = embedding_model or get_provider_embedding_model('ollama')
        self._transport = transport

    async def _request(self, prompt: str, *, json_mode: bool = False, schema: dict | None = None) -> str:
        result = await self._request_with_usage(prompt, json_mode=json_mode, schema=schema, operation='generation')
        return result.text

    async def _request_with_usage(
        self,
        prompt: str,
        *,
        json_mode: bool = False,
        schema: dict | None = None,
        operation: str = 'generation',
    ) -> GenerationResult:
        url = f'{get_ollama_base_url()}/api/generate'
        model = self.model or get_ollama_model()
        body = {
            'model': model,
            'prompt': prompt,
            'stream': False,
            'options': {'num_ctx': get_ollama_context_tokens()},
        }
        if json_mode:
            body['format'] = schema if isinstance(schema, dict) else 'json'
            body['think'] = False
        client_kwargs = {'timeout': get_ollama_generate_timeout_seconds()}
        if self._transport is not None:
            client_kwargs['transport'] = self._transport
        try:
            async with httpx.AsyncClient(**client_kwargs) as client:
                response = await client.post(url, json=body)
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502,
                detail=(
                    f'Ollama indisponível ao gerar com o modelo "{model}" '
                    f'({url}): {type(exc).__name__}'
                ),
            ) from exc
        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=_safe_error_detail(response, model),
            )
        data = response.json()
        if not isinstance(data, dict):
            data = {}
        return GenerationResult(
            text=data.get('response', '') if isinstance(data.get('response', ''), str) else '',
            usage=normalize_usage(data, provider='ollama', model=model, operation=operation),
        )

    async def chat(self, prompt: str) -> str:
        return await self._request(prompt)

    async def chat_with_usage(self, prompt: str) -> GenerationResult:
        return await self._request_with_usage(prompt, operation='generation')

    async def generate_json(self, prompt: str, schema: dict | None = None) -> dict:
        return parse_json_text(await self._request(prompt, json_mode=True, schema=schema))

    async def generate_json_with_usage(
        self, prompt: str, schema: dict | None = None
    ) -> tuple[dict, dict]:
        result = await self._request_with_usage(
            prompt, json_mode=True, schema=schema, operation='generation'
        )
        return parse_json_text(result.text), result.usage

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model = self.embedding_model or get_provider_embedding_model('ollama')
        client_kwargs = {'timeout': get_ollama_generate_timeout_seconds()}
        if self._transport is not None:
            client_kwargs['transport'] = self._transport
        try:
            async with httpx.AsyncClient(**client_kwargs) as client:
                response = await client.post(
                    f'{get_ollama_base_url()}/api/embed',
                    json={'model': model, 'input': texts},
                )
        except httpx.HTTPError as exc:
            raise ProviderRequestError(
                f'Ollama indisponível ao gerar embeddings com o modelo "{model}".',
                code='provider_unavailable',
            ) from exc
        if response.status_code != 200:
            raise ProviderRequestError(
                f'Ollama rejeitou a geração de embeddings com o modelo "{model}".',
                code='provider_request_failed',
                status_code=response.status_code,
            )
        try:
            payload = response.json()
            embeddings = payload.get('embeddings') if isinstance(payload, dict) else None
        except ValueError as exc:
            raise ProviderRequestError('Ollama retornou embeddings inválidos.', code='invalid_embedding_response') from exc
        if not isinstance(embeddings, list) or len(embeddings) != len(texts):
            raise ProviderRequestError('Ollama não retornou todos os embeddings.', code='invalid_embedding_response')
        return embeddings
