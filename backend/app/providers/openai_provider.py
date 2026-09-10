import httpx

from app.providers.base import ChatProvider, ProviderRequestError, parse_json_text
from app.providers.http_utils import response_json


class OpenAIProvider(ChatProvider):
    endpoint = 'https://api.openai.com/v1/chat/completions'
    embeddings_endpoint = 'https://api.openai.com/v1/embeddings'

    def __init__(self, api_key: str, model: str, embedding_model: str | None = None, transport=None, timeout: float = 600.0):
        self.api_key = api_key
        self.model = model
        self.embedding_model = embedding_model or 'text-embedding-3-small'
        self._transport = transport
        self.timeout = timeout

    async def _request(self, prompt: str, json_mode: bool = False) -> str:
        body = {
            'model': self.model,
            'messages': [{'role': 'user', 'content': prompt}],
            'temperature': 0,
            'stream': False,
        }
        if json_mode:
            body['response_format'] = {'type': 'json_object'}
        kwargs = {'timeout': self.timeout}
        if self._transport is not None:
            kwargs['transport'] = self._transport
        try:
            async with httpx.AsyncClient(**kwargs) as client:
                response = await client.post(
                    self.endpoint,
                    headers={'Authorization': f'Bearer {self.api_key}', 'Content-Type': 'application/json'},
                    json=body,
                )
        except httpx.HTTPError as exc:
            raise ProviderRequestError('OpenAI está indisponível no momento.', code='provider_unavailable') from exc
        payload = response_json(response, 'OpenAI')
        try:
            content = payload['choices'][0]['message']['content']
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderRequestError('OpenAI não retornou conteúdo.', code='empty_response') from exc
        if not isinstance(content, str) or not content.strip():
            raise ProviderRequestError('OpenAI retornou uma resposta vazia.', code='empty_response')
        return content

    async def chat(self, prompt: str) -> str:
        return await self._request(prompt)

    async def generate_json(self, prompt: str) -> dict:
        return parse_json_text(await self._request(prompt, json_mode=True))

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        kwargs = {'timeout': self.timeout}
        if self._transport is not None:
            kwargs['transport'] = self._transport
        try:
            async with httpx.AsyncClient(**kwargs) as client:
                response = await client.post(
                    self.embeddings_endpoint,
                    headers={
                        'Authorization': f'Bearer {self.api_key}',
                        'Content-Type': 'application/json',
                    },
                    json={'model': self.embedding_model, 'input': texts, 'encoding_format': 'float'},
                )
        except httpx.HTTPError as exc:
            raise ProviderRequestError('OpenAI está indisponível no momento.', code='provider_unavailable') from exc
        payload = response_json(response, 'OpenAI')
        data = payload.get('data')
        if not isinstance(data, list) or len(data) != len(texts):
            raise ProviderRequestError('OpenAI não retornou todos os embeddings.', code='invalid_embedding_response')
        try:
            ordered = sorted(data, key=lambda item: int(item.get('index', 0)))
            values = [item['embedding'] for item in ordered]
        except (KeyError, TypeError, ValueError) as exc:
            raise ProviderRequestError('OpenAI retornou embeddings inválidos.', code='invalid_embedding_response') from exc
        if any(not isinstance(item, list) or not item for item in values):
            raise ProviderRequestError('OpenAI retornou embeddings inválidos.', code='invalid_embedding_response')
        return values
