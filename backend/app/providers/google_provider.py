import httpx

from app.providers.base import ChatProvider, ProviderRequestError, parse_json_text
from app.providers.http_utils import response_json


class GoogleProvider(ChatProvider):
    endpoint_template = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
    embeddings_endpoint_template = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents'

    def __init__(self, api_key: str, model: str, embedding_model: str | None = None, transport=None, timeout: float = 600.0):
        self.api_key = api_key
        self.model = model
        self.embedding_model = embedding_model or 'gemini-embedding-001'
        self._transport = transport
        self.timeout = timeout

    async def _request(self, prompt: str, json_mode: bool = False) -> str:
        body = {
            'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
            'generationConfig': {'temperature': 0},
        }
        if json_mode:
            body['generationConfig']['responseMimeType'] = 'application/json'
        kwargs = {'timeout': self.timeout}
        if self._transport is not None:
            kwargs['transport'] = self._transport
        try:
            async with httpx.AsyncClient(**kwargs) as client:
                response = await client.post(
                    self.endpoint_template.format(model=self.model),
                    headers={'x-goog-api-key': self.api_key, 'content-type': 'application/json'},
                    json=body,
                )
        except httpx.HTTPError as exc:
            raise ProviderRequestError('Google está indisponível no momento.', code='provider_unavailable') from exc
        payload = response_json(response, 'Google')
        try:
            parts = payload['candidates'][0]['content']['parts']
            text = ''.join(part.get('text', '') for part in parts if isinstance(part, dict))
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderRequestError('Google não retornou conteúdo.', code='empty_response') from exc
        if not text.strip():
            raise ProviderRequestError('Google retornou uma resposta vazia.', code='empty_response')
        return text

    async def chat(self, prompt: str) -> str:
        return await self._request(prompt)

    async def generate_json(self, prompt: str) -> dict:
        return parse_json_text(await self._request(prompt, json_mode=True))

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model_name = self.embedding_model.removeprefix('models/')
        requests = [
            {
                'model': f'models/{model_name}',
                'content': {'parts': [{'text': text}]},
            }
            for text in texts
        ]
        kwargs = {'timeout': self.timeout}
        if self._transport is not None:
            kwargs['transport'] = self._transport
        try:
            async with httpx.AsyncClient(**kwargs) as client:
                response = await client.post(
                    self.embeddings_endpoint_template.format(model=model_name),
                    headers={'x-goog-api-key': self.api_key, 'content-type': 'application/json'},
                    json={'requests': requests},
                )
        except httpx.HTTPError as exc:
            raise ProviderRequestError('Google está indisponível no momento.', code='provider_unavailable') from exc
        payload = response_json(response, 'Google')
        embeddings = payload.get('embeddings')
        if not isinstance(embeddings, list) or len(embeddings) != len(texts):
            raise ProviderRequestError('Google não retornou todos os embeddings.', code='invalid_embedding_response')
        values = [item.get('values') for item in embeddings if isinstance(item, dict)]
        if len(values) != len(texts) or any(not isinstance(item, list) or not item for item in values):
            raise ProviderRequestError('Google retornou embeddings inválidos.', code='invalid_embedding_response')
        return values
