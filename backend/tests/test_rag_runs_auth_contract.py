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
from app.models import auth_token, document, pipeline, user  # noqa: F401
from app.rag.registry import STRATEGY_IDS


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


def _run(coro):
    return asyncio.run(coro)


async def _login(client, username='run_usr', password='run_pass123'):
    await client.post('/api/auth/register', json={'username': username, 'password': password})
    response = await client.post('/api/auth/login', json={'username': username, 'password': password})
    assert response.status_code == 200
    return response.json()['access_token']


def _auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


async def _fake_run_query(db, payload, *, resolved_scope=None):
    return {
        'execution_id': f'exec_{payload.strategy}',
        'answer': f'resposta {payload.strategy}',
        'strategy': payload.strategy,
        'provider': payload.provider,
        'sources': [f'{payload.strategy}.md'],
        'chunks': [{
            'chunkId': f'{payload.strategy}_chunk_1',
            'chunk_id': f'{payload.strategy}_chunk_1',
            'rank': 1,
            'documentId': '1',
            'document_id': '1',
            'filename': f'{payload.strategy}.md',
            'chunkIndex': 0,
            'chunk_index': 0,
            'text': f'trecho {payload.strategy}',
            'score': 0.8,
            'vectorScore': 0.8,
            'vector_score': 0.8,
            'lexicalScore': None,
            'lexical_score': None,
            'metadata': {'filename': f'{payload.strategy}.md'},
        }],
        'metrics': {
            'total_ms': 10,
            'totalMs': 10,
            'retrieval_ms': 4,
            'retrievalMs': 4,
            'llm_ms': 6,
            'llmMs': 6,
            'chunk_count': 1,
            'chunkCount': 1,
            'source_count': 1,
            'sourceCount': 1,
        },
    }


def test_logout_revokes_current_token(app):
    async def scenario():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url='http://test'
        ) as client:
            token = await _login(client)
            headers = _auth_headers(token)

            assert (await client.get('/api/auth/me', headers=headers)).status_code == 200
            assert (await client.post('/api/auth/logout', headers=headers)).status_code == 200
            assert (await client.get('/api/auth/me', headers=headers)).status_code == 401

    _run(scenario())


def test_metadata_routes_require_authentication(app, monkeypatch):
    class FakeResponse:
        status_code = 200

    monkeypatch.setattr('app.api.routes.system.httpx.get', lambda *args, **kwargs: FakeResponse())
    monkeypatch.setattr('app.api.routes.system.ChromaService.safe_count', staticmethod(lambda: 3))

    async def scenario():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url='http://test'
        ) as client:
            for path in ['/api/system/status', '/api/providers', '/api/rag/strategies']:
                assert (await client.get(path)).status_code == 401

            token = await _login(client)
            headers = _auth_headers(token)
            for path in ['/api/system/status', '/api/providers', '/api/rag/strategies']:
                assert (await client.get(path, headers=headers)).status_code == 200

    _run(scenario())


def test_rag_runs_accept_public_strategies_and_persist_results(app, monkeypatch):
    from app.services.document_scope import ResolvedDocumentScope
    scope = ResolvedDocumentScope('all', (), ('1',), ('test.pdf',), 'ollama', 'embed', None, None)
    monkeypatch.setattr('app.services.rag_run_service.resolve_documents', lambda *args, **kwargs: scope)
    monkeypatch.setattr('app.services.rag_run_service.RAGService.run_query', _fake_run_query)

    async def scenario():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url='http://test'
        ) as client:
            token = await _login(client)
            headers = _auth_headers(token)
            response = await client.post(
                '/api/rag/runs',
                headers=headers,
                json={
                    'mode': 'single',
                    'question': 'pergunta',
                    'provider': 'ollama',
                    'top_k': 10,
                    'strategies': list(STRATEGY_IDS),
                },
            )
            assert response.status_code == 200
            body = response.json()
            assert body['strategies'] == list(STRATEGY_IDS)
            assert [item['strategy'] for item in body['results']] == list(STRATEGY_IDS)
            run_id = body['run_id']

            fetched = await client.get(f'/api/rag/runs/{run_id}', headers=headers)
            assert fetched.status_code == 200
            fetched_body = fetched.json()
            assert fetched_body['run_id'] == run_id
            assert [item['strategy'] for item in fetched_body['results']] == list(STRATEGY_IDS)

            events = await client.get(f'/api/rag/runs/{run_id}/events', headers=headers)
            assert events.status_code == 200
            assert events.json()[0]['stage'] == 'queued'

    _run(scenario())
