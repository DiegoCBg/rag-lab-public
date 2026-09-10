import httpx

from app.providers.base import ChatProvider, ProviderRequestError, parse_json_text
from app.providers.http_utils import response_json


class AnthropicProvider(ChatProvider):
    endpoint = 'https://api.anthropic.com/v1/messages'

    def __init__(self, api_key: str, model: str, transport=None, timeout: float = 600.0):
        self.api_key = api_key
        self.model = model
        self._transport = transport
        self.timeout = timeout

    async def _request(self, prompt: str) -> str:
        body = {
            'model': self.model,
            'max_tokens': 4096,
            'temperature': 0,
            'messages': [{'role': 'user', 'content': prompt}],
        }
        kwargs = {'timeout': self.timeout}
        if self._transport is not None:
            kwargs['transport'] = self._transport
        try:
            async with httpx.AsyncClient(**kwargs) as client:
                response = await client.post(
                    self.endpoint,
                    headers={
                        'x-api-key': self.api_key,
                        'anthropic-version': '2023-06-01',
                        'content-type': 'application/json',
                    },
                    json=body,
                )
        except httpx.HTTPError as exc:
            raise ProviderRequestError('Anthropic está indisponível no momento.', code='provider_unavailable') from exc
        payload = response_json(response, 'Anthropic')
        try:
            blocks = payload['content']
            text = ''.join(block.get('text', '') for block in blocks if block.get('type') == 'text')
        except (KeyError, TypeError) as exc:
            raise ProviderRequestError('Anthropic não retornou conteúdo.', code='empty_response') from exc
        if not text.strip():
            raise ProviderRequestError('Anthropic retornou uma resposta vazia.', code='empty_response')
        return text

    async def chat(self, prompt: str) -> str:
        return await self._request(prompt)

    async def generate_json(self, prompt: str) -> dict:
        return parse_json_text(await self._request(prompt))
