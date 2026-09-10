import pytest
from sqlalchemy.orm import Session
from unittest.mock import MagicMock

from app.schemas.benchmark import BenchmarkCompareRequest, BenchmarkQuestion, BenchmarkRequest
from app.services.benchmark_service import BenchmarkService
from app.services.rag_service import RAGService


async def fake_run_query(_db, payload):
    return {
        'answer': f'{payload.strategy} resposta com contrato e cadastro',
        'sources': ['doc.md'],
    }


async def capture_locale_run_query(captured):
    async def _fake(_db, payload):
        captured.append({
            'strategy': payload.strategy,
            'locale': payload.locale,
            'top_k': payload.top_k,
            'content_type_filter': payload.content_type_filter,
            'status_filter': payload.status_filter,
        })
        return {
            'answer': f'{payload.strategy} resposta com contrato',
            'sources': ['doc.md'],
        }
    return _fake


@pytest.mark.asyncio
async def test_benchmark_does_not_score_empty_expected_keywords_as_perfect(monkeypatch):
    monkeypatch.setattr(RAGService, 'run_query', staticmethod(fake_run_query))
    payload = BenchmarkRequest(
        strategy='hybrid',
        provider='stub',
        items=[BenchmarkQuestion(question='Pergunta sem criterio')],
    )

    result = await BenchmarkService.run(MagicMock(spec=Session), payload)

    assert result['average_keyword_score'] is None
    assert result['evaluated_items'] == 0
    assert result['total_items'] == 1
    assert result['warning'] == BenchmarkService.NO_EVALUABLE_ITEMS_WARNING
    assert result['items'][0]['keyword_hits'] == 0
    assert result['items'][0]['keyword_total'] == 0
    assert result['items'][0]['score_ratio'] is None
    assert result['items'][0]['evaluated'] is False


@pytest.mark.asyncio
async def test_benchmark_average_ignores_items_without_expected_keywords(monkeypatch):
    monkeypatch.setattr(RAGService, 'run_query', staticmethod(fake_run_query))
    payload = BenchmarkRequest(
        strategy='hybrid',
        provider='stub',
        items=[
            BenchmarkQuestion(question='Avaliada', expected_keywords=['contrato', 'ausente']),
            BenchmarkQuestion(question='Sem criterio'),
        ],
    )

    result = await BenchmarkService.run(MagicMock(spec=Session), payload)

    assert result['average_keyword_score'] == 0.5
    assert result['evaluated_items'] == 1
    assert result['total_items'] == 2
    assert result['warning'] == BenchmarkService.NO_EXPECTED_KEYWORDS_WARNING
    assert result['items'][0]['score_ratio'] == 0.5
    assert result['items'][1]['score_ratio'] is None


@pytest.mark.asyncio
async def test_benchmark_passes_default_locale_to_ragservice(monkeypatch):
    captured = []
    monkeypatch.setattr(RAGService, 'run_query', staticmethod(await capture_locale_run_query(captured)))
    payload = BenchmarkRequest(
        strategy='hybrid',
        provider='stub',
        items=[BenchmarkQuestion(question='Avaliada', expected_keywords=['contrato'])],
    )

    await BenchmarkService.run(MagicMock(spec=Session), payload)

    assert captured == [{
        'strategy': 'hybrid',
        'locale': 'pt-BR',
        'top_k': 10,
        'content_type_filter': None,
        'status_filter': None,
    }]


@pytest.mark.asyncio
async def test_compare_without_expected_keywords_is_not_a_draw(monkeypatch):
    monkeypatch.setattr(RAGService, 'run_query', staticmethod(fake_run_query))
    payload = BenchmarkCompareRequest(
        primary_strategy='vector',
        secondary_strategy='hybrid',
        provider='stub',
        items=[BenchmarkQuestion(question='Sem criterio')],
    )

    result = await BenchmarkService.compare(MagicMock(spec=Session), payload)

    assert result['primary_average'] is None
    assert result['secondary_average'] is None
    assert result['evaluated_items'] == 0
    assert result['total_items'] == 1
    assert result['winner'] == 'not_evaluated'
    assert result['rows'][0]['winner'] == 'not_evaluated'
    assert result['rows'][0]['evaluated'] is False


@pytest.mark.asyncio
async def test_compare_average_uses_only_evaluable_rows(monkeypatch):
    monkeypatch.setattr(RAGService, 'run_query', staticmethod(fake_run_query))
    payload = BenchmarkCompareRequest(
        primary_strategy='vector',
        secondary_strategy='hybrid',
        provider='stub',
        items=[
            BenchmarkQuestion(question='Avaliada', expected_keywords=['vector', 'contrato']),
            BenchmarkQuestion(question='Sem criterio'),
        ],
    )

    result = await BenchmarkService.compare(MagicMock(spec=Session), payload)

    assert result['primary_average'] == 1.0
    assert result['secondary_average'] == 0.5
    assert result['evaluated_items'] == 1
    assert result['total_items'] == 2
    assert result['winner'] == 'vector'
    assert result['rows'][0]['winner'] == 'vector'
    assert result['rows'][1]['winner'] == 'not_evaluated'


@pytest.mark.asyncio
async def test_compare_passes_locale_to_both_ragservice_calls(monkeypatch):
    captured = []
    monkeypatch.setattr(RAGService, 'run_query', staticmethod(await capture_locale_run_query(captured)))
    payload = BenchmarkCompareRequest(
        primary_strategy='vector',
        secondary_strategy='hybrid',
        provider='stub',
        locale='en',
        items=[BenchmarkQuestion(question='Avaliada', expected_keywords=['contrato'])],
    )

    await BenchmarkService.compare(MagicMock(spec=Session), payload)

    assert captured == [
        {
            'strategy': 'vector',
            'locale': 'en',
            'top_k': 10,
            'content_type_filter': None,
            'status_filter': None,
        },
        {
            'strategy': 'hybrid',
            'locale': 'en',
            'top_k': 10,
            'content_type_filter': None,
            'status_filter': None,
        },
    ]
