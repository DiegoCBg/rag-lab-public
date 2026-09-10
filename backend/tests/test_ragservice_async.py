import asyncio
from unittest.mock import MagicMock

from sqlalchemy.orm import Session

from app.schemas.rag import RAGQueryRequest
from app.services.rag_service import _complete_answer_text, _evidence_package, _generate_answer_json_with_usage, _query_prompt


class DummyStrategy:
    async def retrieve(self, question, filters=None, top_k=None, provider=None):
        return [{'text': 'mock', 'metadata': {'filename': 'file.txt', 'document_id': '1'}, 'score': 1.0}]


class DummyProvider:
    async def chat(self, prompt):
        return 'answer'


def test_run_query_with_async_strategy(monkeypatch):
    async def run():
        monkeypatch.setattr('app.services.rag_factory.RAGFactory.create', lambda *args, **kwargs: DummyStrategy())
        monkeypatch.setattr('app.services.provider_factory.ProviderFactory.create', lambda provider_name: DummyProvider())
        monkeypatch.setattr('app.services.execution_service.ExecutionService.log', lambda *args, **kwargs: None)
        payload = RAGQueryRequest(
            strategy='vector',
            provider='dummy_provider',
            content_type_filter=None,
            status_filter=None,
            question='test',
        )
        from app.services.rag_service import RAGService
        from app.services.document_scope import ResolvedDocumentScope
        scope = ResolvedDocumentScope('all', (), ('1',), ('file.txt',), 'ollama', 'embed', None, None)
        monkeypatch.setattr('app.services.document_scope.check_available', lambda *args: None)
        result = await RAGService.run_query(MagicMock(spec=Session), payload, resolved_scope=scope)
        assert isinstance(result, dict)
        assert result['answer'] == 'answer'
        assert result['sources'] == ['file.txt']
        assert not asyncio.iscoroutine(result)

    asyncio.run(run())


def test_evidence_package_compacts_quote_without_text_duplication():
    package = _evidence_package([{
        'chunkId': '1_chunk_1',
        'documentId': '1',
        'filename': 'livro.pdf',
        'text': 'x' * 5000,
        'score': 0.91,
        'origin': 'vector',
        'sectionId': '1:section:0001',
    }])

    assert package[0]['evidence_id'] == 'chunk:1_chunk_1'
    assert 'quote' in package[0]
    assert 'text' not in package[0]
    assert len(package[0]['quote']) < 5000


def test_query_prompt_preserves_question_in_task_envelope():
    payload = RAGQueryRequest(
        strategy='vector',
        provider='ollama',
        question='Como as cartas transferem poder?',
        top_k=50,
    )
    prompt = _query_prompt(
        payload,
        {'content_type': None, 'status': None},
        [{'evidence_id': 'e1', 'quote': 'Carta enviada.', 'chunk_id': 'c1'}],
    )

    assert '"question": "Como as cartas transferem poder?"' in prompt
    assert 'não invente fatos' in prompt
    assert '"quote": "Carta enviada."' in prompt
    assert '"text": "Carta enviada."' not in prompt


def test_generate_answer_json_falls_back_to_markdown_when_json_provider_fails():
    class JsonFailingProvider:
        def __init__(self):
            self.chat_prompt = None

        async def generate_json(self, prompt):
            raise RuntimeError('json inválido')

        async def chat(self, prompt):
            self.chat_prompt = prompt
            return 'resposta em markdown'

    async def run():
        provider = JsonFailingProvider()
        structured, raw, _usage = await _generate_answer_json_with_usage(provider, 'task.question = teste')
        assert structured == {}
        assert raw == 'resposta em markdown'
        assert 'Markdown legível' in provider.chat_prompt

    asyncio.run(run())


def test_generate_answer_json_does_not_accept_empty_structured_payload():
    class EmptyJsonProvider:
        async def generate_json(self, prompt):
            return {}

        async def chat(self, prompt):
            return 'resposta narrativa recuperada'

    async def run():
        structured, raw, _usage = await _generate_answer_json_with_usage(EmptyJsonProvider(), 'task.question = teste')
        assert structured == {}
        assert raw == 'resposta narrativa recuperada'

    asyncio.run(run())


def test_complete_answer_text_exposes_grounded_claims_and_limitations():
    answer = _complete_answer_text(
        {
            'answer_text': 'Resumo inicial.',
            'limitations': ['Cobertura parcial.'],
        },
        [{'text': 'A carta altera a decisão.', 'grounded': True}],
        '',
    )

    assert 'Resumo inicial.' in answer
    assert 'A carta altera a decisão.' in answer
    assert 'Cobertura parcial.' in answer
