import asyncio

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.router import api_router
from app.db import session as db_session
from app.db.session import Base
import app.models.app_setting  # noqa: F401
import app.models.user  # noqa: F401


@pytest.fixture
def app():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    test_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = test_session()
        try:
            yield db
        finally:
            db.close()

    application = FastAPI()
    application.include_router(api_router, prefix='/api')
    application.dependency_overrides[db_session.get_db] = override_get_db
    return application


async def login(client):
    await client.post('/api/auth/register', json={'username': 'provider_user', 'password': 'pass12345'})
    response = await client.post('/api/auth/login', json={'username': 'provider_user', 'password': 'pass12345'})
    return response.json()['access_token']


def test_provider_test_requires_authentication(app):
    async def scenario():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            response = await client.post('/api/providers/openai/test')
            assert response.status_code == 401

    asyncio.run(scenario())


def test_provider_metadata_and_test_use_saved_model_without_execution(app, monkeypatch):
    calls = []

    class DummyProvider:
        async def test(self):
            calls.append('tested')

    monkeypatch.setattr('app.api.routes.providers.ProviderFactory.create', staticmethod(lambda provider_id: DummyProvider()))

    async def scenario():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            token = await login(client)
            headers = {'Authorization': f'Bearer {token}'}
            patch = await client.patch(
                '/api/settings',
                json={'items': {'openai_api_key': 'test-key', 'openai_model': 'custom-model'}},
                headers=headers,
            )
            assert patch.status_code == 200

            providers = await client.get('/api/providers', headers=headers)
            openai = next(item for item in providers.json() if item['id'] == 'openai')
            assert openai['configured'] is True
            assert openai['can_use'] is True
            assert openai['selected_model'] == 'custom-model'

            tested = await client.post('/api/providers/openai/test', headers=headers)
            assert tested.status_code == 200
            assert tested.json()['model'] == 'custom-model'
            assert calls == ['tested']

    asyncio.run(scenario())
