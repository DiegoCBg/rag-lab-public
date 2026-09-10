import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.router import api_router
from app.db import session as db_session
from app.db.session import Base
import app.models.user  # noqa: F401  garante registro da tabela users
import app.models.app_setting  # noqa: F401  garante registro da tabela app_settings


@pytest.fixture
def app():
    engine = create_engine(
        'sqlite://',
        connect_args={'check_same_thread': False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    application = FastAPI()
    application.include_router(api_router, prefix='/api')
    application.dependency_overrides[db_session.get_db] = override_get_db
    return application


def _login(app, username='probe_usr', password='probe_pass123'):
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url='http://test'
        ) as client:
            response = await client.post(
                '/api/auth/register',
                json={'username': username, 'password': password},
            )
            if response.status_code == 400:
                response = None
            response = await client.post(
                '/api/auth/login', json={'username': username, 'password': password}
            )
            return response.json()['access_token']
    return asyncio_run(run())


def asyncio_run(coro):
    import asyncio
    return asyncio.run(coro)


def _auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


def test_register_login_and_me(app):
    token = _login(app)
    assert token

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url='http://test'
        ) as client:
            me = await client.get('/api/auth/me', headers=_auth_headers(token))
            assert me.status_code == 200
            body = me.json()
            assert body['username'] == 'probe_usr'
            assert body['is_admin'] is True  # primeiro usuário vira admin
    asyncio_run(run())


def test_change_password(app):
    token = _login(app)

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url='http://test'
        ) as client:
            response = await client.patch(
                '/api/auth/me/password',
                json={'current_password': 'wrong', 'new_password': 'nova-senha-123'},
                headers=_auth_headers(token),
            )
            assert response.status_code == 400
            response = await client.patch(
                '/api/auth/me/password',
                json={'current_password': 'probe_pass123', 'new_password': 'nova-senha-123'},
                headers=_auth_headers(token),
            )
            assert response.status_code == 200
            login = await client.post(
                '/api/auth/login', json={'username': 'probe_usr', 'password': 'nova-senha-123'}
            )
            assert login.status_code == 200
    asyncio_run(run())


def test_forgot_password_returns_new_password(app):
    token = _login(app)

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url='http://test'
        ) as client:
            response = await client.post(
                '/api/auth/forgot-password', json={'username': 'probe_usr'}
            )
            assert response.status_code == 200
            body = response.json()
            assert body['username'] == 'probe_usr'
            assert len(body['new_password']) >= 12
            login = await client.post(
                '/api/auth/login',
                json={'username': 'probe_usr', 'password': body['new_password']},
            )
            assert login.status_code == 200
            response = await client.post(
                '/api/auth/forgot-password', json={'username': 'nao-existe'}
            )
            assert response.status_code == 400
    asyncio_run(run())


def test_admin_users_crud(app):
    token = _login(app)

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url='http://test'
        ) as client:
            created = await client.post(
                '/api/admin/users',
                json={'username': 'sec_usr', 'password': 'senha-123', 'is_admin': False},
                headers=_auth_headers(token),
            )
            assert created.status_code == 201
            user_id = created.json()['id']

            listing = await client.get('/api/admin/users', headers=_auth_headers(token))
            assert listing.status_code == 200
            assert len(listing.json()) == 2

            updated = await client.patch(
                f'/api/admin/users/{user_id}',
                json={'is_active': False},
                headers=_auth_headers(token),
            )
            assert updated.status_code == 200
            assert updated.json()['is_active'] is False

            reset = await client.post(
                f'/api/admin/users/{user_id}/reset-password',
                headers=_auth_headers(token),
            )
            assert reset.status_code == 200
            assert reset.json()['new_password']

            deleted = await client.delete(
                f'/api/admin/users/{user_id}', headers=_auth_headers(token)
            )
            assert deleted.status_code == 200
    asyncio_run(run())


def test_routes_open_to_all_authenticated_users_but_require_token(app):
    token = _login(app)
    # registra um segundo usuário comum (não-admin)
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url='http://test'
        ) as client:
            await client.post(
                '/api/auth/register', json={'username': 'common', 'password': 'senha-123'}
            )
            common_login = await client.post(
                '/api/auth/login', json={'username': 'common', 'password': 'senha-123'}
            )
            common_token = common_login.json()['access_token']
            # usuário comum pode listar usuários e ler settings
            response = await client.get(
                '/api/admin/users', headers=_auth_headers(common_token)
            )
            assert response.status_code == 200
            response = await client.get(
                '/api/settings', headers=_auth_headers(common_token)
            )
            assert response.status_code == 200
            # sem token, tudo é rejeitado
            response = await client.get('/api/admin/users')
            assert response.status_code == 401
            response = await client.get('/api/settings')
            assert response.status_code == 401
            # e um usuário comum pode criar outro usuário
            created = await client.post(
                '/api/admin/users',
                json={'username': 'by_common', 'password': 'senha-124'},
                headers=_auth_headers(common_token),
            )
            assert created.status_code == 201
            # mas não pode se desativar
            common_me = await client.get('/api/auth/me', headers=_auth_headers(common_token))
            common_id = common_me.json()['id']
            blocked = await client.patch(
                f'/api/admin/users/{common_id}',
                json={'is_active': False},
                headers=_auth_headers(common_token),
            )
            assert blocked.status_code == 400
    asyncio_run(run())


def test_settings_get_and_patch(app):
    token = _login(app)

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url='http://test'
        ) as client:
            fetched = await client.get('/api/settings', headers=_auth_headers(token))
            assert fetched.status_code == 200
            items = fetched.json()['items']
            keys = {item['key'] for item in items}
            assert 'ollama_base_url' in keys
            assert 'openai_api_key' in keys

            patched = await client.patch(
                '/api/settings',
                json={'items': {'ollama_model': 'gpt-oss:20b', 'openai_api_key': 'sk-secret-abc123'}},
                headers=_auth_headers(token),
            )
            assert patched.status_code == 200
            by_key = {item['key']: item for item in patched.json()['items']}
            assert by_key['ollama_model']['value'] == 'gpt-oss:20b'
            assert by_key['openai_api_key']['is_set'] is True
            assert 'secret' not in by_key['openai_api_key']['value']
            assert by_key['openai_api_key']['value'].startswith('sk-s')

            rejected = await client.patch(
                '/api/settings',
                json={'items': {'ollama_model': 'x', 'hack': 'y'}},
                headers=_auth_headers(token),
            )
            assert rejected.status_code == 400
    asyncio_run(run())


def test_system_status_uses_runtime_ollama_model(app, monkeypatch):
    token = _login(app)

    class FakeResponse:
        status_code = 200

    monkeypatch.setattr('app.api.routes.system.httpx.get', lambda *args, **kwargs: FakeResponse())
    monkeypatch.setattr('app.api.routes.system.ChromaService.heartbeat', staticmethod(lambda: True))
    monkeypatch.setattr('app.api.routes.system.ChromaService.safe_count', staticmethod(lambda: 12))

    from app.api.routes.system import clear_system_status_cache
    clear_system_status_cache()

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url='http://test'
        ) as client:
            patched = await client.patch(
                '/api/settings',
                json={'items': {'ollama_model': 'qwen3.5:30b'}},
                headers=_auth_headers(token),
            )
            assert patched.status_code == 200

            response = await client.get('/api/system/status', headers=_auth_headers(token))
            assert response.status_code == 200
            body = response.json()
            assert body['ollama']['model'] == 'qwen3.5:30b'
    asyncio_run(run())


def test_system_status_reports_chroma_unavailable_without_failing(app, monkeypatch):
    token = _login(app)

    class FakeResponse:
        status_code = 200

    from app.services.chroma_service import VectorStoreUnavailable
    from app.api.routes.system import clear_system_status_cache

    monkeypatch.setattr('app.api.routes.system.httpx.get', lambda *args, **kwargs: FakeResponse())
    monkeypatch.setattr(
        'app.api.routes.system.ChromaService.heartbeat',
        staticmethod(lambda: (_ for _ in ()).throw(VectorStoreUnavailable('offline'))),
    )
    clear_system_status_cache()

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url='http://test'
        ) as client:
            response = await client.get('/api/system/status', headers=_auth_headers(token))
            assert response.status_code == 200
            body = response.json()
            assert body['chroma']['status'] == 'error'
            assert body['chroma']['vector_count'] == 0
            assert body['chroma']['error'] == 'vector_store_unavailable'
    asyncio_run(run())


def test_ollama_models_endpoint(app, monkeypatch):
    token = _login(app)

    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                'models': [
                    {'name': 'gpt-oss:20b', 'size': 2048, 'modified_at': '2026-01-01'},
                    {'name': 'qwen3.6:latest', 'size': 4096, 'modified_at': '2026-02-01'},
                ]
            }

    class FakeClient:
        def __init__(self, timeout=None, transport=None):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url, timeout=None):
            return FakeResponse()

    monkeypatch.setattr('app.api.routes.ollama.AsyncClient', FakeClient)

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url='http://test'
        ) as client:
            response = await client.get('/api/ollama/models', headers=_auth_headers(token))
            assert response.status_code == 200
            body = response.json()
            names = [m['name'] for m in body['models']]
            assert names == ['gpt-oss:20b', 'qwen3.6:latest']
    asyncio_run(run())
