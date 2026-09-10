import json

import pytest

from app.services import semantic_analyzer
from app.services.provider_factory import ProviderFactory


class CapturingProvider:
    def __init__(self, response):
        self.response = response
        self.prompts = []

    async def chat(self, prompt):
        self.prompts.append(prompt)
        return json.dumps(self.response)


class FailingProvider:
    async def chat(self, prompt):
        raise RuntimeError('provider indisponível')


@pytest.mark.asyncio
async def test_analyze_execution_formats_json_contract_as_literal(monkeypatch):
    provider = CapturingProvider({
        'main_topic': 'tema',
        'claims': [],
        'subtopics': [],
        'conclusions': [],
        'information_omitted_from_answer': [],
        'unsupported_claims': [],
    })
    monkeypatch.setattr(ProviderFactory, 'create', staticmethod(lambda _: provider))

    result = await semantic_analyzer.analyze_execution({
        'provider': 'ollama',
        'question': 'Qual o impacto?',
        'raw_answer': 'Impacta o runtime.',
        'chunks': [],
    })

    assert result['main_topic'] == 'tema'
    assert '"main_topic": "..."' in provider.prompts[0]
    assert '"question": "Qual o impacto?"' in provider.prompts[0]
    assert 'auditor de evidência de uma execução RAG' in provider.prompts[0]


@pytest.mark.asyncio
async def test_build_comparison_formats_json_contract_as_literal(monkeypatch):
    provider = CapturingProvider({
        'shared_main_topic': 'tema comum',
        'consensus_claims': [],
        'equivalent_claims': [],
        'unique_claims_by_strategy': {},
        'contradictions': [],
        'coverage_gaps': [],
        'unsupported_claims': [],
        'synthesis_status': 'valid',
        'synthesis_reason': 'compatível',
        'combined_synthesis': 'Síntese.',
    })
    monkeypatch.setattr(ProviderFactory, 'create', staticmethod(lambda _: provider))

    result = await semantic_analyzer.build_comparison(
        'ollama', 'Qual o impacto?', [{'main_topic': 'tema comum'}]
    )

    assert result['synthesis_status'] == 'invalid'
    assert result['reliability'] == 'insuficiente'
    assert '"shared_main_topic": "..."' in provider.prompts[0]
    assert '"unique_claims_by_strategy": {"vector":' in provider.prompts[0]
    assert 'relevant_to_question=true' in provider.prompts[0]
    assert 'Não gere display_label nem display_status' in provider.prompts[0]
    assert 'redator-sintetizador de uma investigação documental comparativa' in provider.prompts[0]


@pytest.mark.asyncio
async def test_analyze_execution_uses_english_locale_without_ptbr_instruction(monkeypatch):
    provider = CapturingProvider({
        'main_topic': 'topic',
        'claims': [],
        'subtopics': [],
        'conclusions': [],
        'information_omitted_from_answer': [],
        'unsupported_claims': [],
    })
    monkeypatch.setattr(ProviderFactory, 'create', staticmethod(lambda _: provider))

    await semantic_analyzer.analyze_execution({
        'provider': 'ollama',
        'locale': 'en',
        'question': 'What is supported?',
        'raw_answer': 'It is supported.',
        'chunks': [],
    })

    assert 'Write ALL generated text' in provider.prompts[0]
    assert 'português brasileiro' not in provider.prompts[0]


@pytest.mark.asyncio
async def test_build_comparison_uses_english_locale_without_ptbr_instruction(monkeypatch):
    provider = CapturingProvider({
        'shared_main_topic': 'topic',
        'consensus_claims': [],
        'equivalent_claims': [],
        'unique_claims_by_strategy': {},
        'contradictions': [],
        'coverage_gaps': [],
        'unsupported_claims': [],
        'synthesis_status': 'valid',
        'synthesis_reason': 'compatible',
        'combined_synthesis': 'Synthesis.',
    })
    monkeypatch.setattr(ProviderFactory, 'create', staticmethod(lambda _: provider))

    await semantic_analyzer.build_comparison(
        'ollama',
        'What is supported?',
        [{'main_topic': 'topic'}],
        locale='en',
    )

    assert 'Write ALL generated text' in provider.prompts[0]
    assert 'português brasileiro' not in provider.prompts[0]


@pytest.mark.asyncio
async def test_build_comparison_sends_compact_claim_package_not_full_ledger(monkeypatch):
    provider = CapturingProvider({
        'shared_main_topic': 'tema',
        'consensus_claims': [],
        'equivalent_claims': [],
        'unique_claims_by_strategy': {},
        'contradictions': [],
        'coverage_gaps': [],
        'unsupported_claims': [],
        'synthesis_status': 'partial',
        'synthesis_reason': 'cobertura',
        'combined_synthesis': 'síntese',
    })
    monkeypatch.setattr(ProviderFactory, 'create', staticmethod(lambda _: provider))
    analysis = {
        'strategy': 'hybrid',
        'main_topic': 'tema',
        'claims': [{
            'claim_id': 'c1',
            'text': 'claim sustentada',
            'type': 'fact',
            'grounded': True,
            'evidence_ids': ['evidence:1'],
            'section_ids': ['section:1'],
        }],
        'evidence_ledger': [{
            'evidence_id': 'evidence:1',
            'quote': 'citação integral que não deve ser reenviada à síntese',
        }],
        'query_coverage': {'coverage_status': 'partial', 'coverage': 0.8},
    }

    await semantic_analyzer.build_comparison('ollama', 'Qual a relação?', [analysis])

    prompt = provider.prompts[0]
    assert 'claim sustentada' in prompt
    assert 'evidence:1' in prompt
    assert 'citação integral que não deve ser reenviada' in prompt
    assert 'evidence_refs' in prompt
    assert 'PACOTE DA SÍNTESE' in prompt


@pytest.mark.asyncio
async def test_build_comparison_classifies_unique_claims_in_backend(monkeypatch):
    provider = CapturingProvider({
        'shared_main_topic': 'tema',
        'consensus_claims': [],
        'equivalent_claims': [],
        'unique_claims_by_strategy': {
        'hybrid': [{
                'claim_id': 'u1',
                'text': 'O Sr. Bennet tem atitude distante.',
                'type': 'interpretation',
                'evidence_ids': ['evidence:1'],
                'section_ids': ['section:1'],
                'confidence': 0.91,
                'relevant_to_question': True,
            }],
        },
        'contradictions': [],
        'coverage_gaps': [],
        'unsupported_claims': [],
        'synthesis_status': 'partial',
        'synthesis_reason': 'evidência parcial',
        'combined_synthesis': 'síntese',
    })
    monkeypatch.setattr(ProviderFactory, 'create', staticmethod(lambda _: provider))
    result = await semantic_analyzer.build_comparison('ollama', 'pergunta', [{
        'strategy': 'hybrid',
        'claims': [{'grounded': True, 'evidence_ids': ['evidence:1']}],
        'evidence_ledger': [{'evidence_id': 'evidence:1', 'quote': 'quote'}],
    }])

    claim = result['unique_claims_by_strategy']['hybrid'][0]
    assert claim['display_status'] == 'supported_complementary'
    assert claim['strategies'] == ['hybrid']
    assert claim['confidence'] == 0.91
    assert result['contradictions'] == []


@pytest.mark.asyncio
async def test_build_comparison_moves_low_confidence_to_review(monkeypatch):
    provider = CapturingProvider({
        'shared_main_topic': 'tema',
        'consensus_claims': [{
            'claim_id': 'c1',
            'text': 'claim fraca',
            'type': 'fact',
            'evidence_ids': ['evidence:1'],
            'confidence': 0.3,
        }],
        'equivalent_claims': [],
        'unique_claims_by_strategy': {},
        'contradictions': [],
        'coverage_gaps': [],
        'unsupported_claims': [],
        'synthesis_status': 'partial',
        'synthesis_reason': 'evidência parcial',
        'combined_synthesis': 'síntese',
    })
    monkeypatch.setattr(ProviderFactory, 'create', staticmethod(lambda _: provider))
    result = await semantic_analyzer.build_comparison('ollama', 'pergunta', [{
        'strategy': 'vector',
        'claims': [{'grounded': True, 'evidence_ids': ['evidence:1']}],
        'evidence_ledger': [{'evidence_id': 'evidence:1', 'quote': 'quote'}],
    }])

    assert result['consensus_claims'] == []
    assert result['unsupported_claims'][0]['display_status'] == 'review_required'
    assert result['unsupported_claims'][0]['confidence'] == 0.3


@pytest.mark.asyncio
async def test_build_comparison_rejects_contradiction_without_two_evidence_sides(monkeypatch):
    provider = CapturingProvider({
        'shared_main_topic': 'tema',
        'consensus_claims': [],
        'equivalent_claims': [],
        'unique_claims_by_strategy': {},
        'contradictions': ['texto sem ids dos dois lados'],
        'coverage_gaps': [],
        'unsupported_claims': [],
        'synthesis_status': 'partial',
        'synthesis_reason': 'evidência parcial',
        'combined_synthesis': 'síntese',
    })
    monkeypatch.setattr(ProviderFactory, 'create', staticmethod(lambda _: provider))
    result = await semantic_analyzer.build_comparison('ollama', 'pergunta', [{
        'strategy': 'vector',
        'claims': [{'grounded': True, 'evidence_ids': ['evidence:1']}],
        'evidence_ledger': [{'evidence_id': 'evidence:1', 'quote': 'quote'}],
    }])

    assert result['contradictions'] == []
    assert result['unsupported_claims'][0]['display_status'] == 'unsupported'


def test_calculate_reliability_hint_matches_user_thresholds():
    supported = [{
        'strategy': f's{i}',
        'claims': [{'grounded': True, 'evidence_ids': [f'e{i}']}],
    } for i in range(5)]

    assert semantic_analyzer.calculate_reliability_hint(
        supported[:3],
        total_requested=7,
        failed=0,
        partial=0,
    )['classification'] == 'regular'

    assert semantic_analyzer.calculate_reliability_hint(
        supported,
        total_requested=7,
        failed=0,
        partial=0,
    )['classification'] == 'boa'


@pytest.mark.asyncio
async def test_build_comparison_preserves_synthesis_when_llm_fails(monkeypatch):
    monkeypatch.setattr(ProviderFactory, 'create', staticmethod(lambda _: FailingProvider()))
    result = await semantic_analyzer.build_comparison(
        'ollama',
        'Qual a transformação?',
        [{
            'strategy': 'vector',
            'main_topic': 'transformação',
            'claims': [{
                'grounded': True,
                'text': 'A percepção muda após novas evidências.',
                'evidence_ids': ['evidence:1'],
                'confidence': 0.9,
            }],
        }],
    )

    assert result['synthesis_status'] == 'partial'
    assert 'A percepção muda após novas evidências.' in result['combined_synthesis']
    assert 'síntese de contingência' in result['synthesis_reason']


def test_fallback_uses_individual_claims_without_synthesis_labels():
    result = semantic_analyzer._fallback_comparison([
        {
            'strategy': 'vector',
            'claims': [
                {
                    'grounded': True,
                    'text': 'A carta altera a decisão do personagem.',
                    'evidence_ids': ['evidence:1'],
                    'confidence': 0.92,
                },
                {
                    'grounded': True,
                    'text': 'Ponto de baixa confiança.',
                    'evidence_ids': ['evidence:2'],
                    'confidence': 0.69,
                    'display_status': 'supported_consensus',
                },
            ],
            'evidence_ledger': [
                {'evidence_id': 'evidence:1', 'quote': 'A carta altera a decisão.'},
                {'evidence_id': 'evidence:2', 'quote': 'Ponto.'},
            ],
        },
    ], 'falha de parsing')

    assert 'A carta altera a decisão do personagem.' in result['combined_synthesis']
    assert 'Ponto de baixa confiança.' not in result['combined_synthesis']
    assert 'não foram classificados como consenso' in result['combined_synthesis']
    assert result['fallback_used'] is True


def test_fallback_rejects_missing_confidence_and_invalid_evidence():
    result = semantic_analyzer._fallback_comparison([
        {
            'strategy': 'hybrid',
            'claims': [
                {'grounded': True, 'text': 'Sem confiança.', 'evidence_ids': ['e1']},
                {'grounded': True, 'text': 'Evidência inexistente.', 'evidence_ids': ['missing'], 'confidence': 0.95},
            ],
            'evidence_ledger': [{'evidence_id': 'e1', 'quote': 'evidência'}],
        },
    ], 'falha de geração')

    assert 'Sem confiança.' not in result['combined_synthesis']
    assert 'Evidência inexistente.' not in result['combined_synthesis']
    assert result['reliability'] == 'insuficiente'
