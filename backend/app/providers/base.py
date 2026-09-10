import json
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


class ProviderError(Exception):
    """Erro sanitizado de integração com um provedor de IA."""

    def __init__(self, message: str, code: str = 'provider_error', status_code: int | None = None):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class ProviderConfigurationError(ProviderError):
    def __init__(self, message: str):
        super().__init__(message, code='provider_not_configured', status_code=409)


class ProviderRequestError(ProviderError):
    pass


class ProviderCapabilityError(ProviderError):
    def __init__(self, message: str):
        super().__init__(message, code='provider_capability_missing', status_code=409)


@dataclass
class GenerationResult:
    """Texto retornado pelo provedor e metadados de uso, sem conteúdo sensível."""

    text: str
    usage: dict[str, Any]


def normalize_usage(
    payload: dict[str, Any] | None,
    *,
    provider: str | None = None,
    model: str | None = None,
    operation: str | None = None,
) -> dict[str, Any]:
    """Normaliza contadores nativos sem transformar ausência em estimativa."""
    data = payload if isinstance(payload, dict) else {}

    def count(*names: str) -> int | None:
        for name in names:
            value = data.get(name)
            if isinstance(value, bool):
                continue
            if isinstance(value, (int, float)) and value >= 0:
                return int(value)
        return None

    prompt_tokens = count('prompt_eval_count', 'prompt_tokens')
    output_tokens = count('eval_count', 'output_tokens', 'completion_tokens')
    known = prompt_tokens is not None and output_tokens is not None
    return {
        'prompt_tokens': prompt_tokens,
        'output_tokens': output_tokens,
        'total_tokens': prompt_tokens + output_tokens if known else None,
        'prompt_eval_duration_ns': count('prompt_eval_duration', 'prompt_eval_duration_ns'),
        'eval_duration_ns': count('eval_duration', 'eval_duration_ns'),
        'total_duration_ns': count('total_duration', 'total_duration_ns'),
        'provider': provider,
        'model': model,
        'operation': operation,
        'known': known,
    }


def unknown_usage(*, provider: str | None = None, model: str | None = None, operation: str | None = None) -> dict[str, Any]:
    return normalize_usage({}, provider=provider, model=model, operation=operation)


def combine_usage(values: list[dict[str, Any]], *, operation: str | None = None) -> dict[str, Any]:
    """Soma chamadas conhecidas e marca o agregado como parcial se necessário."""
    values = [item for item in values if isinstance(item, dict)]
    prompt_values = [item.get('prompt_tokens') for item in values]
    output_values = [item.get('output_tokens') for item in values]
    prompt_known = all(isinstance(value, int) for value in prompt_values)
    output_known = all(isinstance(value, int) for value in output_values)
    return {
        'prompt_tokens': sum(prompt_values) if values and prompt_known else None,
        'output_tokens': sum(output_values) if values and output_known else None,
        'total_tokens': sum(item['total_tokens'] for item in values)
        if values and all(isinstance(item.get('total_tokens'), int) for item in values) else None,
        'calls': len(values),
        'known': bool(values) and all(bool(item.get('known')) for item in values),
        'partial': bool(values) and not all(bool(item.get('known')) for item in values),
        'operation': operation,
    }


def parse_json_text(text: str) -> dict[str, Any]:
    """Parseia JSON puro ou JSON cercado por markdown sem aceitar texto extra."""
    raw = (text or '').strip()
    if raw.startswith('```'):
        raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.I)
        raw = re.sub(r'\s*```$', '', raw).strip()
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        match = re.search(r'\{.*\}', raw, flags=re.S)
        if not match:
            raise ProviderRequestError('O provedor retornou JSON inválido.', code='invalid_json') from exc
        try:
            value = json.loads(match.group(0))
        except json.JSONDecodeError as nested_exc:
            raise ProviderRequestError('O provedor retornou JSON inválido.', code='invalid_json') from nested_exc
    if not isinstance(value, dict):
        raise ProviderRequestError('O provedor retornou um JSON com formato inválido.', code='invalid_json')
    return value


class ChatProvider(ABC):
    @abstractmethod
    async def chat(self, prompt: str) -> str:
        raise NotImplementedError

    async def generate_json(self, prompt: str, schema: dict[str, Any] | None = None) -> dict[str, Any]:
        return parse_json_text(await self.chat(prompt))

    async def chat_with_usage(self, prompt: str) -> GenerationResult:
        return GenerationResult(await self.chat(prompt), unknown_usage(operation='generation'))

    async def generate_json_with_usage(
        self, prompt: str, schema: dict[str, Any] | None = None
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        return await self.generate_json(prompt, schema=schema), unknown_usage(operation='generation')

    async def embed(self, texts: list[str]) -> list[list[float]]:
        raise ProviderCapabilityError(
            'O provedor configurado não oferece embeddings para o fluxo RAG completo.'
        )

    async def test(self) -> str:
        response = await self.chat('Responda somente com OK.')
        if not response.strip():
            raise ProviderRequestError('O provedor retornou uma resposta vazia.', code='empty_response')
        return response
