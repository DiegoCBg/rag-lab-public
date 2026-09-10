import asyncio

import httpx
import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings


def _build_app(origins):
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )
    app.include_router(api_router, prefix='/api')
    return app


def _configured_origins():
    return [o.strip() for o in settings.cors_origins.split(',') if o.strip()]


def _preflight(transport, origin):
    async def run():
        async with httpx.AsyncClient(
            transport=transport, base_url='http://127.0.0.1:8000'
        ) as client:
            return await client.options(
                '/api/auth/login',
                headers={
                    'Origin': origin,
                    'Access-Control-Request-Method': 'POST',
                    'Access-Control-Request-Headers': 'content-type, authorization',
                },
            )
    return asyncio.run(run())


def test_preflight_allowed_origins_200():
    app = _build_app(_configured_origins())
    for origin in ('http://localhost:5173', 'http://127.0.0.1:5173'):
        response = _preflight(httpx.ASGITransport(app=app), origin)
        assert response.status_code == 200, origin
        assert response.headers.get('access-control-allow-origin') == origin


def test_preflight_disallowed_origin_400():
    app = _build_app(_configured_origins())
    for origin in ('null', 'http://192.168.1.10:5173', 'http://localhost:5174'):
        response = _preflight(httpx.ASGITransport(app=app), origin)
        assert response.status_code == 400, origin
        assert 'Disallowed CORS' in response.text


def test_preflight_custom_origin_from_settings(monkeypatch):
    monkeypatch.setattr(settings, 'cors_origins', 'http://localhost:5173,http://localhost:5174')
    app = _build_app(_configured_origins())
    response = _preflight(httpx.ASGITransport(app=app), 'http://localhost:5174')
    assert response.status_code == 200
    assert response.headers.get('access-control-allow-origin') == 'http://localhost:5174'


def test_wildcard_origin_allows_any(monkeypatch):
    monkeypatch.setattr(settings, 'cors_origins', '*')
    app = _build_app(_configured_origins())
    response = _preflight(httpx.ASGITransport(app=app), 'http://localhost:5174')
    assert response.status_code == 200
    assert response.headers.get('access-control-allow-origin') == 'http://localhost:5174'
