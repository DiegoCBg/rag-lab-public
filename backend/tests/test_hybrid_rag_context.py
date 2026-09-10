import asyncio
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from app.services.runtime_settings import get_active_provider, get_provider_embedding_model

from app.rag.strategies import HybridStrategy
from app.schemas.rag import RAGQueryRequest
from app.services.rag_service import RAGService


class FakeCollection:
    def __init__(self, chunks):
        self.chunks = chunks
        self.query_where = None
        self.get_where = None

    def query(self, query_embeddings=None, query_texts=None, n_results=None, where=None):
        self.query_where = where
        docs = [c['text'] for c in self.chunks]
        metas = [c['metadata'] for c in self.chunks]
        return {
            'documents': [docs],
            'metadatas': [metas],
            'distances': [[0.1] * len(docs)],
        }

    def get(self, where=None, limit=None):
        self.get_where = where
        docs = [c['text'] for c in self.chunks]
        metas = [c['metadata'] for c in self.chunks]
        return {'documents': docs, 'metadatas': metas}


async def fake_embedding(texts):
    return [[0.5] * 8 for _ in texts]


class CaptureStrategy:
    seen_filters = None

    async def retrieve(self, question, filters=None, top_k=None, provider=None):
        CaptureStrategy.seen_filters = filters
        return [
            {'text': 'trecho recuperado do documento', 'filename': 'relatorio.pdf', 'metadata': {'document_id': '1'}},
            {'text': 'segundo trecho do documento', 'filename': 'relatorio.pdf', 'metadata': {'document_id': '1'}},
        ]


class DummyProvider:
    captured_prompt = None

    async def chat(self, prompt):
        DummyProvider.captured_prompt = prompt
        return 'resposta mockada'


class FakeDbQuery:
    def __init__(self, count):
        self._count = count

    def filter(self, *args, **kwargs):
        return self

    def count(self):
        return self._count

    def order_by(self, *args):
        return self

    def populate_existing(self):
        return self

    def all(self):
        provider = get_active_provider()
        return [SimpleNamespace(id=index + 1, filename='relatorio.pdf', content_type='pdf',
                                status='indexed', embedding_provider=provider,
                                embedding_model=get_provider_embedding_model(provider))
                for index in range(self._count)]


class FakeDb:
    def __init__(self, indexed_docs=2):
        self._indexed = indexed_docs

    def query(self, model):
        return FakeDbQuery(self._indexed)


def _patch_rag_deps(monkeypatch, log_calls=None):
    monkeypatch.setattr('app.services.rag_factory.RAGFactory.create', lambda name: CaptureStrategy())
    monkeypatch.setattr('app.services.provider_factory.ProviderFactory.create', lambda name: DummyProvider())
    if log_calls is not None:
        monkeypatch.setattr(
            'app.services.execution_service.ExecutionService.log',
            lambda *a, **k: log_calls.append(a),
        )
    else:
        monkeypatch.setattr(
            'app.services.execution_service.ExecutionService.log',
            lambda *a, **k: None,
        )


def _payload(question='pergunta', strategy='hybrid', provider='ollama',
             content_type_filter='pdf', status_filter='indexed'):
    return RAGQueryRequest(
        question=question,
        strategy=strategy,
        provider=provider,
        content_type_filter=content_type_filter,
        status_filter=status_filter,
    )


def test_status_not_sent_to_chroma_when_not_in_metadata(monkeypatch):
    _patch_rag_deps(monkeypatch)
    result = asyncio.run(RAGService.run_query(FakeDb(), _payload()))
    assert CaptureStrategy.seen_filters == {'document_id': {'$in': ['1', '2']}}
    assert 'status' not in CaptureStrategy.seen_filters
    assert [chunk['text'] for chunk in result['chunks']] == [
        'trecho recuperado do documento',
        'segundo trecho do documento',
    ]
    assert result['chunks'][0]['rank'] == 1
    assert result['chunks'][0]['filename'] == 'relatorio.pdf'


def test_nonexistent_field_filter_does_not_kill_chunks(monkeypatch):
    _patch_rag_deps(monkeypatch)
    result = asyncio.run(RAGService.run_query(FakeDb(), _payload()))
    assert len(result['chunks']) == 2
    assert result['metrics']['chunk_count'] == 2
    assert result['metrics']['source_count'] == 1
    assert result['sources'] == ['relatorio.pdf']


def test_zero_indexed_docs_in_sqlite_returns_honest_empty(monkeypatch):
    _patch_rag_deps(monkeypatch)
    with pytest.raises(HTTPException) as caught:
        asyncio.run(RAGService.run_query(FakeDb(indexed_docs=0), _payload()))
    assert caught.value.status_code == 422


def test_hybrid_strategy_returns_hits_from_mocked_collection(monkeypatch):
    chunks = [
        {'text': 'gatos domesticos caçam ratos', 'metadata': {'content_type': 'pdf', 'document_id': 1, 'filename': 'a.pdf'}},
        {'text': 'cachorros domesticos latem', 'metadata': {'content_type': 'pdf', 'document_id': 1, 'filename': 'a.pdf'}},
    ]
    coll = FakeCollection(chunks)
    monkeypatch.setattr('app.rag.strategies.ChromaService.collection', lambda: coll)
    monkeypatch.setattr('app.rag.strategies.EmbeddingService.ollama_embedding', fake_embedding)
    hits = asyncio.run(
        HybridStrategy().retrieve('o que fazem os gatos', filters={'content_type': 'pdf'})
    )
    assert len(hits) == 2
    texts = [h['text'] for h in hits]
    assert 'gatos domesticos caçam ratos' in texts
    assert coll.query_where == {'content_type': {'$eq': 'pdf'}}
    assert 'status' not in coll.query_where
    assert 'status' not in coll.get_where


def test_hits_reach_ragservice_context_and_prompt(monkeypatch):
    _patch_rag_deps(monkeypatch)
    result = asyncio.run(RAGService.run_query(FakeDb(), _payload()))
    assert 'trecho recuperado do documento' in [chunk['text'] for chunk in result['chunks']]
    assert 'trecho recuperado do documento' in DummyProvider.captured_prompt
    assert 'segundo trecho do documento' in DummyProvider.captured_prompt


def test_no_real_ollama_chroma_or_db_used(monkeypatch):
    log_calls = []
    _patch_rag_deps(monkeypatch, log_calls)
    result = asyncio.run(RAGService.run_query(FakeDb(), _payload()))
    assert result['answer'] == 'resposta mockada'
    assert DummyProvider.captured_prompt is not None
    assert len(log_calls) == 1
    assert log_calls[0][1] == 'pergunta'


