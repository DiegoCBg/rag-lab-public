from typing import Any

import httpx

from app.providers.base import ProviderRequestError


def response_error(provider: str, response: httpx.Response) -> ProviderRequestError:
    code = 'provider_request_failed'
    message = 'rejeitou a solicitação.'
    if response.status_code in (401, 403):
        code = 'provider_authentication_failed'
        message = 'recusou a autenticação. Verifique a chave de API.'
    elif response.status_code == 404:
        code = 'provider_model_not_found'
        message = 'não encontrou o modelo configurado.'
    elif response.status_code == 429:
        code = 'provider_rate_limited'
        message = 'atingiu o limite de solicitações. Tente novamente mais tarde.'
    elif response.status_code >= 500:
        code = 'provider_unavailable'
        message = 'está indisponível no momento.'
    return ProviderRequestError(
        f'{provider} {message}',
        code=code,
        status_code=response.status_code,
    )


def response_json(response: httpx.Response, provider: str) -> dict[str, Any]:
    if response.status_code != 200:
        raise response_error(provider, response)
    try:
        payload = response.json()
    except ValueError as exc:
        raise ProviderRequestError(
            f'{provider} retornou uma resposta inválida.',
            code='invalid_provider_response',
            status_code=response.status_code,
        ) from exc
    if not isinstance(payload, dict):
        raise ProviderRequestError(
            f'{provider} retornou uma resposta inválida.',
            code='invalid_provider_response',
            status_code=response.status_code,
        )
    return payload
