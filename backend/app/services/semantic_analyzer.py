"""Análise semântica por LLM, separada da resposta bruta.

Nunca modifica a resposta bruta: interpreta um payload imutável e devolve
estrutura própria. Implementação mockável nos testes (nunca chama Ollama
em testes).
"""

import json
import logging
import math

from app.providers.base import GenerationResult, combine_usage, unknown_usage
from app.services.provider_factory import ProviderFactory
from app.services.runtime_settings import get_active_provider

logger = logging.getLogger(__name__)

CONFIDENCE_REVIEW_THRESHOLD = 0.50
FALLBACK_CONFIDENCE_THRESHOLD = 0.70
DISPLAY_STATUS_VALUES = {
    'supported_consensus',
    'supported_equivalent',
    'supported_exclusive',
    'supported_complementary',
    'review_required',
    'unsupported',
    'contradiction',
}

_LANGUAGE_INSTRUCTIONS = {
    'pt-BR': (
        'IMPORTANTE: Escreva TODO texto gerado (main_topic, claims, subtopics, '
        'conclusões, síntese e motivos) em português brasileiro. NÃO traduza '
        'trechos citados entre aspas, mas produza sempre o conteúdo em PT-BR.\n'
    ),
    'en': (
        'IMPORTANT: Write ALL generated text (main_topic, claims, subtopics, '
        'conclusions, synthesis and reasons) in English. Do NOT translate quoted '
        'evidence, but always produce your own analysis text in English.\n'
    ),
}


def _normalize_locale(locale: str | None) -> str:
    if not locale:
        return 'pt-BR'
    normalized = locale.strip()
    if normalized.lower().startswith('en'):
        return 'en'
    return 'pt-BR'


def _language_instruction(locale: str | None) -> str:
    return _LANGUAGE_INSTRUCTIONS[_normalize_locale(locale)]

_ANALYSIS_PROMPT = (
    'Você é o auditor de evidência de uma execução RAG.\n\n'
    'Você NÃO deve melhorar, completar, reescrever ou substituir a resposta bruta. '
    'Sua função é decompor a resposta em afirmações e verificar cada uma contra '
    'as evidências fornecidas neste pedido.\n\n'
    'A pergunta original está em task.question. '
    'A resposta auditada está em answer_under_audit.raw_answer. '
    'Os trechos em evidence_ledger são a única fonte documental autorizada.\n\n'
    '{language_instruction}'
    'REGRAS OBRIGATÓRIAS\n'
    '1. Use somente evidence_ledger como evidência documental.\n'
    '2. Não use conhecimento externo ou memória sobre a obra.\n'
    '3. Não corrija a resposta com fatos que não aparecem no ledger.\n'
    '4. A resposta bruta não é evidência.\n'
    '5. Uma claim só pode ser grounded=true quando possuir pelo menos um evidence_id válido que sustente a afirmação inteira.\n'
    '6. Todos os evidence_ids usados devem existir no ledger.\n'
    '7. Uma citação deve apoiar semanticamente a afirmação, não apenas repetir uma palavra da afirmação.\n'
    '8. A presença de duas entidades no mesmo trecho não prova uma relação.\n'
    '9. Coocorrência não prova parentesco, causalidade, influência ou intenção.\n'
    '10. Uma claim causal exige evidência causal ou linguagem causal explícita.\n'
    '11. Uma claim temporal deve respeitar a ordem e o intervalo dos trechos.\n'
    '12. Uma claim relacional deve manter sujeito, objeto e direção corretos.\n'
    '13. Uma entidade mencionada em um trecho não prova que ela exerceu influência.\n'
    '14. Um comportamento descrito no texto pode sustentar uma interpretação, mas a interpretação deve ser classificada como interpretation ou conclusion.\n'
    '15. Se a resposta misturar fato e interpretação, divida-a em claims separadas.\n'
    '16. Se uma claim não possuir evidência suficiente, grounded deve ser false.\n'
    '17. Claims sem suporte devem aparecer em unsupported_claims.\n'
    '18. supporting_chunk_ids é compatibilidade; evidence_ids é a referência principal.\n'
    '19. Verifique qualquer metadado contra o pacote da auditoria, nunca contra uma citação narrativa.\n'
    '20. Não transforme cobertura parcial em ausência do fato.\n'
    '21. Não considere divergência de cobertura como contradição factual.\n'
    '22. Se os trechos forem insuficientes, registre a limitação sem inventar a continuação da história.\n'
    '23. Preserve o tipo correto: fact, interpretation, conclusion ou recommendation.\n'
    '24. Uma interpretação pode ser válida e bem sustentada sem ser um fato literal.\n'
    '25. Uma conclusão pode ser aceitável quando deriva de fatos documentados, mas deve permanecer classificada como conclusão.\n\n'
    'Responda APENAS com JSON válido, sem texto extra, no formato:\n'
    '{{"main_topic": "...", '
    '"claims": [{{"claim_id": "...", "text": "...", "type": "fact|interpretation|conclusion|recommendation", '
    '"grounded": true, "evidence_ids": [], "section_ids": [], "supporting_chunk_ids": [], '
    '"supporting_quotes": [], "source": "document|system_metadata|inference", "confidence": 0.0, "audit_reason": ""}}], '
    '"subtopics": [], "conclusions": [], '
    '"information_omitted_from_answer": [], "unsupported_claims": [], "limitations": [], '
    '"limitations": []}}\n\n'
    'PACOTE DA AUDITORIA:\n{audit_payload}\n'
)

_SYNTHESIS_PROMPT = (
    'Você é o redator-sintetizador de uma investigação documental comparativa.\n\n'
    'Sua tarefa principal é responder diretamente à pergunta presente em task.question.\n'
    'Primeiro produza a melhor resposta sustentada pelas evidências recebidas.\n'
    'Depois explique os fatos utilizados, as interpretações, as limitações e a contribuição de cada estratégia.\n\n'
    'A comparação entre estratégias é apoio para construir a resposta. Ela não é o objetivo principal e não deve substituí-la.\n\n'
    'Não abandone a síntese porque uma estratégia falhou. '
    'Não diga que a síntese é impossível apenas porque existe cobertura parcial. '
    'Quando os dados forem insuficientes, produza uma síntese explicitamente limitada e informe o que não pôde ser confirmado.\n\n'
    '{language_instruction}'
    'ORDEM OBRIGATÓRIA DA TAREFA\n'
    '- Comece respondendo à pergunta original; não comece avaliando as estratégias.\n'
    '- Não tente encaixar todas as informações recuperadas. Use somente o que responde ou explica a pergunta.\n'
    '- Claims exclusivas podem ser utilizadas quando forem relevantes e sustentadas.\n'
    '- A repetição por várias estratégias não é requisito para uma claim ser válida.\n'
    '- Falha ou cobertura parcial de uma estratégia não invalida evidências válidas das demais.\n'
    '- Não transforme ausência de repetição em contradição.\n'
    '- Separe fatos, interpretações, conclusões e lacunas.\n'
    '- Quando houver qualquer evidência admissível, produza uma resposta útil.\n'
    '- Nunca diga que a pergunta não foi fornecida quando task.question estiver preenchida.\n\n'
    'REGRAS DE FONTE\n'
    '1. Use somente as análises e evidências fornecidas neste pedido.\n'
    '2. Não use conhecimento externo, memória do modelo ou conhecimento geral.\n'
    '3. A pergunta define o escopo da síntese.\n'
    '4. Não responda a uma pergunta diferente.\n'
    '5. Não trate consenso numérico como prova automática.\n'
    '6. Repetição da mesma evidência por várias estratégias é uma única base factual.\n'
    '7. Uma afirmação só pode entrar como fato se possuir evidence_ids válidos.\n'
    '8. Uma claim sem evidência deve permanecer em unsupported_claims.\n'
    '9. Não crie evidence_ids, section_ids, entidades ou citações.\n'
    '10. Não invente seções faltantes.\n'
    '11. Não trate diferença de cobertura como contradição.\n'
    '12. Contradição existe somente quando duas afirmações sustentadas são incompatíveis sobre o mesmo objeto, relação ou período.\n'
    '13. Claims equivalentes têm o mesmo sujeito, objeto, relação, evento e período, mesmo que usem palavras diferentes.\n'
    '14. Uma estratégia pode encontrar uma informação exclusiva válida.\n'
    '15. Informação exclusiva válida deve ser preservada; não descarte apenas porque ela não aparece nas demais estratégias.\n'
    '16. Use relevant_to_question=true quando a claim exclusiva ajuda a responder diretamente à pergunta; use false quando for lateral.\n'
    '17. Não gere display_label nem display_status. O backend decidirá o rótulo de exibição.\n'
    '18. Para type, use apenas um valor por claim: fact, interpretation ou conclusion.\n'
    '19. Confidence deve ser número entre 0.0 e 1.0; abaixo de 0.50 não deve entrar em consensus_claims, equivalent_claims nem unique_claims_by_strategy.\n'
    '20. Todo evidence_id usado deve existir em evidence_refs e evidence_refs deve conter quote.\n'
    '21. Se um evidence_ref necessário não tiver quote, registre a lacuna em coverage_gaps; não invente citação.\n'
    '22. Uma interpretação válida não deve ser removida somente por não ser fato literal.\n'
    '23. Fatos, interpretações e conclusões devem permanecer separados.\n'
    '24. Não use a quantidade de trechos recuperados como sinônimo de qualidade.\n'
    '25. Não transforme cobertura parcial em ausência do fato.\n'
    '26. Não transforme a falha de uma estratégia em invalidação das demais.\n'
    '27. A síntese deve explicar os limites de confiabilidade.\n'
    '28. combined_synthesis deve começar pela resposta direta à pergunta original.\n'
    '29. Depois da resposta, apresente fundamentação, contribuição das estratégias, lacunas e confiabilidade.\n'
    '30. O texto da síntese deve ser completo o bastante para leitura humana.\n'
    '31. combined_synthesis deve ser Markdown válido dentro de uma string JSON.\n'
    '32. Não escreva asteriscos de Markdown fora da string JSON.\n'
    '33. Não coloque uma resposta vazia quando houver claims sustentadas.\n'
    '34. Se houver pelo menos uma claim factual ou interpretativa sustentada, combined_synthesis deve apresentar essa informação.\n'
    '35. Se nenhuma conclusão completa puder ser feita, combined_synthesis deve apresentar a melhor resposta parcial possível e declarar a lacuna.\n\n'
    'NÍVEIS DE CONFIABILIDADE\n'
    'O backend fornece reliability_hint, calculado a partir das execuções. Use esse valor como orientação e não o substitua arbitrariamente.\n'
    '- ótima: convergência ampla e evidência consistente;\n'
    '- boa: maioria das estratégias concluída e sustentação suficiente;\n'
    '- regular: evidência útil, mas sustentação limitada;\n'
    '- insuficiente: dados insuficientes para o núcleo da pergunta.\n\n'
    'Responda APENAS com JSON, sem texto extra, no formato:\n'
    '{{"shared_main_topic": "...", '
    '"consensus_claims": [{{"claim_id": "sclaim_001", "text": "...", "type": "fact", "evidence_ids": [], "strategies": [], "section_ids": [], "confidence": 0.8}}], '
    '"equivalent_claims": [{{"claim_id": "eclaim_001", "text": "...", "type": "interpretation", "evidence_ids": [], "strategies": [], "section_ids": [], "confidence": 0.8}}], '
    '"unique_claims_by_strategy": {{"vector": [{{"claim_id": "uclaim_001", "text": "...", "type": "fact", "evidence_ids": [], "section_ids": [], "confidence": 0.8, "relevant_to_question": true}}]}}, '
    '"contradictions": [{{"text": "...", "claim_a": "...", "claim_b": "...", "evidence_ids_a": [], "evidence_ids_b": [], "strategies": [], "confidence": 0.8}}], '
    '"coverage_gaps": [], "unsupported_claims": [], '
    '"synthesis_status": "valid|partial|invalid", "reliability": "otima|boa|regular|insuficiente", "synthesis_reason": "", '
    '"combined_synthesis": ""}}\n\n'
    'PACOTE DA SÍNTESE:\n{synthesis_payload}\n'
)


def _parse_json_object(text: str) -> dict:
    if not text:
        return {}
    cleaned = text.strip()
    if cleaned.startswith('```'):
        cleaned = cleaned.strip('`')
        if cleaned.startswith('json'):
            cleaned = cleaned[4:].strip()
    start = cleaned.find('{')
    end = cleaned.rfind('}')
    if start == -1 or end == -1 or end <= start:
        return {}
    candidate = cleaned[start:end + 1]
    try:
        data = json.loads(candidate)
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        logger.warning('JSON inválido da análise: %s', exc)
        return {}


def _fallback_topic(raw_answer: str) -> str:
    paragraphs = [
        item.strip() for item in str(raw_answer or '').split('\n\n')
        if item.strip() and not item.strip().startswith('#')
    ]
    return '\n\n'.join(paragraphs[:2])


def _short_text(value, limit: int = 800) -> str:
    if value is None:
        return ''
    if isinstance(value, str):
        return value[:limit]
    return str(value)[:limit]


def _short_list(value, item_limit: int = 240, max_items: int = 12) -> list[str]:
    if isinstance(value, str):
        return [_short_text(value, item_limit)] if value else []
    if not isinstance(value, list):
        return []
    return [_short_text(item, item_limit) for item in value[:max_items] if item is not None]


def _compact_evidence_ledger(ledger: list[dict], quote_limit: int = 1800, max_items: int = 80) -> list[dict]:
    compact = []
    seen = set()
    for item in ledger or []:
        if not isinstance(item, dict):
            continue
        evidence_id = item.get('evidence_id') or item.get('evidenceId')
        if not evidence_id:
            continue
        evidence_id = str(evidence_id)
        if evidence_id in seen:
            continue
        seen.add(evidence_id)
        compact.append({
            'evidence_id': evidence_id,
            'source_evidence_id': item.get('source_evidence_id'),
            'document_id': item.get('document_id') or item.get('documentId'),
            'filename': item.get('filename'),
            'chunk_id': item.get('chunk_id') or item.get('chunkId'),
            'quote': _short_text(item.get('quote') or item.get('text'), quote_limit),
            'origin': item.get('origin') or 'vector',
            'source_type': item.get('source_type') or 'retrieved_chunk',
            'score': item.get('score') if item.get('score') is not None else item.get('confidence'),
        })
        if len(compact) >= max_items:
            break
    return compact


def _ledger_index(ledger: list[dict]) -> dict[str, dict]:
    return {
        str(item.get('evidence_id')): item
        for item in ledger or []
        if isinstance(item, dict) and item.get('evidence_id')
    }


def _normalize_confidence(value) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric) or numeric < 0 or numeric > 1:
        return None
    return numeric


def _claim_text(value) -> str:
    if isinstance(value, dict):
        return _short_text(value.get('text') or value.get('claim') or value.get('description'), 1200)
    return _short_text(value, 1200)


def _as_claim_dict(value, *, strategy: str | None = None) -> dict:
    if isinstance(value, dict):
        claim = dict(value)
    else:
        claim = {'text': _claim_text(value)}
    claim['text'] = _claim_text(claim)
    if strategy:
        strategies = claim.get('strategies')
        if not isinstance(strategies, list) or not strategies:
            claim['strategies'] = [strategy]
    elif not isinstance(claim.get('strategies'), list):
        claim['strategies'] = []
    claim['confidence'] = _normalize_confidence(claim.get('confidence'))
    return claim


def _collect_allowed_evidence_ids(analyses: list[dict]) -> set[str]:
    ledger_ids = {
        str(item.get('evidence_id'))
        for analysis in analyses or []
        for item in (
            analysis.get('evidence_ledger')
            or analysis.get('evidence_package')
            or analysis.get('evidence_refs')
            or []
        )
        if isinstance(item, dict) and item.get('evidence_id')
    }
    if ledger_ids:
        return ledger_ids
    # Compatibility for tests and old rows that predate the evidence ledger.
    return {
        str(evidence_id)
        for analysis in analyses or []
        for claim in analysis.get('claims') or []
        if isinstance(claim, dict)
        for evidence_id in claim.get('evidence_ids') or []
        if evidence_id
    }


def _valid_evidence_ids(claim: dict, allowed_ids: set[str]) -> list[str]:
    ids = [str(value) for value in (claim.get('evidence_ids') or []) if value]
    if not allowed_ids:
        return ids
    return [value for value in ids if value in allowed_ids]


def _claim_strategies(claim: dict, fallback: str | None = None) -> list[str]:
    values = claim.get('strategies')
    out = []
    if isinstance(values, list):
        out = [str(item) for item in values if item]
    elif isinstance(values, str) and values:
        out = [values]
    if fallback and fallback not in out:
        out.append(fallback)
    return out


def _unsupported_from_claim(claim: dict, status: str, reason: str, strategy: str | None = None) -> dict:
    return {
        'claim_id': claim.get('claim_id'),
        'text': claim.get('text') or '',
        'type': claim.get('type'),
        'evidence_ids': [str(item) for item in claim.get('evidence_ids') or [] if item],
        'section_ids': [str(item) for item in claim.get('section_ids') or [] if item],
        'strategies': _claim_strategies(claim, strategy),
        'confidence': claim.get('confidence'),
        'relevant_to_question': claim.get('relevant_to_question'),
        'display_status': status,
        'classification_reason': reason,
        'reason': reason,
    }


def _classify_supported_claim(
    claim: dict,
    status: str,
    reason: str,
    allowed_ids: set[str],
    strategy: str | None = None,
) -> tuple[dict | None, dict | None]:
    claim = _as_claim_dict(claim, strategy=strategy)
    ids = _valid_evidence_ids(claim, allowed_ids)
    if not ids:
        return None, _unsupported_from_claim(
            {**claim, 'evidence_ids': []},
            'unsupported',
            'Claim sem evidence_id válido no ledger da comparação.',
            strategy=strategy,
        )
    confidence = claim.get('confidence')
    if confidence is None or confidence < CONFIDENCE_REVIEW_THRESHOLD:
        return None, _unsupported_from_claim(
            {**claim, 'evidence_ids': ids},
            'review_required',
            'Claim possui evidência, mas a confiança está ausente, inválida ou abaixo de 0.50.',
            strategy=strategy,
        )
    out = {
        **claim,
        'evidence_ids': ids,
        'section_ids': [str(item) for item in claim.get('section_ids') or [] if item],
        'strategies': _claim_strategies(claim, strategy),
        'display_status': status,
        'classification_reason': reason,
    }
    if out.get('display_status') not in DISPLAY_STATUS_VALUES:
        out['display_status'] = status
    return out, None


def _normalize_unsupported_claim(value, allowed_ids: set[str], strategy: str | None = None) -> dict:
    claim = _as_claim_dict(value, strategy=strategy)
    ids = _valid_evidence_ids(claim, allowed_ids)
    confidence = claim.get('confidence')
    if ids and (confidence is None or confidence < CONFIDENCE_REVIEW_THRESHOLD):
        status = 'review_required'
        reason = claim.get('reason') or claim.get('classification_reason') or (
            'Claim possui evidência, mas requer revisão por confiança ausente, inválida ou abaixo de 0.50.'
        )
    else:
        status = 'unsupported'
        reason = claim.get('reason') or claim.get('classification_reason') or (
            'Claim sem evidence_id válido ou sem suporte suficiente no ledger.'
        )
    return _unsupported_from_claim(
        {**claim, 'evidence_ids': ids},
        status,
        reason,
        strategy=strategy,
    )


def _normalize_contradiction(value, allowed_ids: set[str]) -> tuple[dict | None, dict | None]:
    claim = _as_claim_dict(value)
    ids_a = [str(item) for item in claim.get('evidence_ids_a') or [] if item and (not allowed_ids or str(item) in allowed_ids)]
    ids_b = [str(item) for item in claim.get('evidence_ids_b') or [] if item and (not allowed_ids or str(item) in allowed_ids)]
    combined = _valid_evidence_ids(claim, allowed_ids)
    has_two_sides = bool(ids_a and ids_b)
    if not has_two_sides and len(combined) >= 2:
        ids_a = [combined[0]]
        ids_b = [combined[1]]
        has_two_sides = True
    if not has_two_sides:
        return None, _unsupported_from_claim(
            {**claim, 'evidence_ids': combined},
            'unsupported',
            'Contradição rejeitada porque não possui evidência válida nos dois lados.',
        )
    confidence = claim.get('confidence')
    if confidence is None or confidence < CONFIDENCE_REVIEW_THRESHOLD:
        return None, _unsupported_from_claim(
            {**claim, 'evidence_ids': sorted(set(ids_a + ids_b))},
            'review_required',
            'Contradição possui evidência, mas requer revisão por confiança ausente, inválida ou abaixo de 0.50.',
        )
    return {
        **claim,
        'evidence_ids_a': ids_a,
        'evidence_ids_b': ids_b,
        'evidence_ids': sorted(set(ids_a + ids_b)),
        'display_status': 'contradiction',
        'classification_reason': 'Duas claims sustentadas são incompatíveis sobre o mesmo sujeito, objeto, relação, evento ou período.',
    }, None


def normalize_analysis_claims(analysis: dict, allowed_ids: set[str] | None = None) -> dict:
    """Adds public claim status to per-strategy analyses without changing text."""
    if not isinstance(analysis, dict):
        return analysis
    allowed_ids = allowed_ids or _collect_allowed_evidence_ids([analysis])
    normalized = dict(analysis)
    unsupported = list(normalized.get('unsupported_claims') or [])
    claims = []
    strategy = normalized.get('strategy')
    for index, value in enumerate(normalized.get('claims') or []):
        if not isinstance(value, dict):
            continue
        claim = _as_claim_dict(value, strategy=strategy)
        claim.setdefault('claim_id', f'claim_{index + 1:03d}')
        claim.setdefault('evidence_ids', [])
        claim.setdefault('section_ids', [])
        ids = _valid_evidence_ids(claim, allowed_ids)
        if claim.get('grounded') and not ids:
            claim['grounded'] = False
            claim['display_status'] = 'unsupported'
            claim['classification_reason'] = 'Claim grounded sem evidence_id válido no ledger da execução.'
            unsupported.append(_unsupported_from_claim(claim, 'unsupported', claim['classification_reason'], strategy=strategy))
        elif claim.get('grounded') and (claim.get('confidence') is None or claim.get('confidence') < CONFIDENCE_REVIEW_THRESHOLD):
            claim['display_status'] = 'review_required'
            claim['classification_reason'] = 'Claim possui evidência, mas requer revisão por confiança ausente, inválida ou abaixo de 0.50.'
        elif claim.get('grounded'):
            claim['display_status'] = 'supported_exclusive'
            claim['classification_reason'] = 'Claim sustentada pela auditoria da estratégia.'
        else:
            claim['display_status'] = 'unsupported'
            claim['classification_reason'] = claim.get('audit_reason') or 'Claim marcada como não sustentada pela auditoria.'
        claim['evidence_ids'] = ids
        claim['strategies'] = _claim_strategies(claim, strategy)
        claims.append(claim)
    normalized['claims'] = claims
    normalized['unsupported_claims'] = [
        _normalize_unsupported_claim(item, allowed_ids, strategy=strategy)
        for item in unsupported
    ]
    return normalized


def normalize_comparison_result(result: dict, analyses: list[dict] | None = None) -> dict:
    """Centralizes the public display classification for comparison claims."""
    if not isinstance(result, dict):
        return result
    analyses = analyses or []
    allowed_ids = _collect_allowed_evidence_ids(analyses)
    normalized = dict(result)
    rejected = [
        _normalize_unsupported_claim(item, allowed_ids)
        for item in normalized.get('unsupported_claims') or []
    ]

    for key, status, reason in (
        ('consensus_claims', 'supported_consensus', 'Claim sustentada por duas ou mais estratégias.'),
        ('equivalent_claims', 'supported_equivalent', 'Claim equivalente sustentada, mas fora do consenso principal.'),
    ):
        kept = []
        for item in normalized.get(key) or []:
            claim, rejection = _classify_supported_claim(item, status, reason, allowed_ids)
            if claim:
                kept.append(claim)
            elif rejection:
                rejected.append(rejection)
        normalized[key] = kept

    unique_out = {}
    unique = normalized.get('unique_claims_by_strategy') or {}
    if isinstance(unique, dict):
        for strategy, items in unique.items():
            strategy_key = str(strategy)
            values = items if isinstance(items, list) else [items]
            kept = []
            for item in values:
                claim = _as_claim_dict(item, strategy=strategy_key)
                relevant = claim.get('relevant_to_question')
                status = 'supported_complementary' if relevant is True else 'supported_exclusive'
                reason = (
                    'Claim exclusiva sustentada e relevante para responder à pergunta.'
                    if status == 'supported_complementary'
                    else 'Claim sustentada por uma única estratégia e preservada como informação exclusiva.'
                )
                classified, rejection = _classify_supported_claim(claim, status, reason, allowed_ids, strategy=strategy_key)
                if classified:
                    kept.append(classified)
                elif rejection:
                    rejected.append(rejection)
            if kept:
                unique_out[strategy_key] = kept
    normalized['unique_claims_by_strategy'] = unique_out

    contradictions = []
    for item in normalized.get('contradictions') or []:
        contradiction, rejection = _normalize_contradiction(item, allowed_ids)
        if contradiction:
            contradictions.append(contradiction)
        elif rejection:
            rejected.append(rejection)
    normalized['contradictions'] = contradictions
    normalized['unsupported_claims'] = rejected
    return normalized


def _evidence_refs_for_claims(analysis: dict, quote_limit: int = 420) -> list[dict]:
    ledger = _ledger_index(_compact_evidence_ledger(analysis.get('evidence_ledger') or analysis.get('evidence_package') or [], quote_limit=quote_limit))
    used_ids = []
    for claim in analysis.get('claims') or []:
        if not isinstance(claim, dict) or not claim.get('grounded'):
            continue
        for evidence_id in claim.get('evidence_ids') or []:
            value = str(evidence_id)
            if value in ledger and value not in used_ids:
                used_ids.append(value)
    return [ledger[evidence_id] for evidence_id in used_ids[:40]]


def _has_supported_claims(analysis: dict) -> bool:
    for claim in analysis.get('claims') or []:
        if not isinstance(claim, dict):
            continue
        if claim.get('grounded') and claim.get('evidence_ids'):
            return True
    return False


def calculate_reliability_hint(
    analyses: list[dict],
    total_requested: int | None = None,
    failed: int = 0,
    partial: int = 0,
) -> dict:
    total = int(total_requested or len(analyses) or 0)
    supported = sum(1 for analysis in analyses if _has_supported_claims(analysis))
    completed = max(0, len(analyses) - int(failed or 0))
    partial_count = int(partial or 0)
    classification = 'insuficiente'
    if total and supported == total and failed == 0 and partial_count == 0:
        classification = 'otima'
    elif total and completed > total / 2 and supported >= 2:
        classification = 'boa'
    elif supported > 0:
        classification = 'regular'
    return {
        'total': total,
        'completed': completed,
        'supported': supported,
        'partial': partial_count,
        'failed': int(failed or 0),
        'classification': classification,
    }


def _status_for_reliability(reliability: str) -> str:
    if reliability in {'otima', 'boa'}:
        return 'valid'
    if reliability == 'regular':
        return 'partial'
    return 'invalid'


def _compact_synthesis_analysis(analysis: dict, ultra_compact: bool = False) -> dict:
    """Retorna sinais auditados; chunks, quotes e o ledger ficam persistidos."""
    claim_limit = 420 if ultra_compact else 800
    claims = []
    for claim in analysis.get('claims') or []:
        if not isinstance(claim, dict):
            continue
        claims.append({
            'claim_id': claim.get('claim_id'),
            'text': _short_text(claim.get('text'), claim_limit),
            'type': claim.get('type'),
            'grounded': bool(claim.get('grounded')),
            'evidence_ids': [str(item) for item in (claim.get('evidence_ids') or [])[:8]],
            'section_ids': [str(item) for item in (claim.get('section_ids') or [])[:8]],
            'confidence': claim.get('confidence'),
            'relevant_to_question': claim.get('relevant_to_question'),
            'display_status': claim.get('display_status'),
            'classification_reason': claim.get('classification_reason'),
            'source': claim.get('source'),
        })
    return {
        'strategy': analysis.get('strategy'),
        'status': analysis.get('status'),
        'main_topic': _short_text(analysis.get('main_topic'), 500),
        'claims': claims[:24 if not ultra_compact else 12],
        'conclusions': _short_list(analysis.get('conclusions'), claim_limit, 6),
        'unsupported_claims': _short_list(analysis.get('unsupported_claims'), claim_limit, 8),
        'limitations': _short_list(analysis.get('limitations'), claim_limit, 8),
        'evidence_refs': _evidence_refs_for_claims(analysis, quote_limit=260 if ultra_compact else 420),
    }


def _compact_synthesis_payload(analyses: list[dict], ultra_compact: bool = False) -> list[dict]:
    return [_compact_synthesis_analysis(analysis, ultra_compact=ultra_compact) for analysis in analyses]


def _fallback_comparison(analyses: list[dict], reason: str, reliability_hint: dict | None = None) -> dict:
    """Cria uma resposta de contingência sem depender do resultado da síntese."""
    reliability_hint = reliability_hint or calculate_reliability_hint(analyses)
    reliability = reliability_hint.get('classification') or 'insuficiente'
    grounded_claims = []
    seen = set()
    for analysis in analyses:
        strategy = analysis.get('strategy') or 'estratégia'
        allowed_ids = _collect_allowed_evidence_ids([analysis])
        for claim in analysis.get('claims') or []:
            if not isinstance(claim, dict) or not claim.get('grounded'):
                continue
            confidence = _normalize_confidence(claim.get('confidence'))
            if confidence is None or confidence < FALLBACK_CONFIDENCE_THRESHOLD:
                continue
            evidence_ids = _valid_evidence_ids(claim, allowed_ids)
            text = _short_text(claim.get('text'), 600).strip()
            if not text or not evidence_ids or text in seen:
                continue
            seen.add(text)
            grounded_claims.append((strategy, text, evidence_ids, confidence))

    grounded_claims.sort(key=lambda item: (-item[3], item[0], item[1].casefold()))
    fallback_reliability = reliability if grounded_claims else 'insuficiente'

    if grounded_claims:
        lines = [
            '## Resposta direta',
            '',
            'A resposta de contingência foi construída a partir das afirmações individuais sustentadas pelas evidências recuperadas:',
            '',
        ]
        for strategy, text, evidence_ids, _confidence in grounded_claims[:20]:
            lines.append(f'- **{strategy}**: {text} (evidências: {", ".join(evidence_ids[:4])})')
        lines.extend([
            '',
            '## Limitação da síntese',
            '',
            'A comparação semântica entre as estratégias não foi concluída nesta execução. '
            'Os pontos acima são claims individuais sustentadas e não foram classificados '
            'como consenso, equivalência ou informação exclusiva.',
            '',
            '## Confiabilidade',
            '',
            'A classificação foi calculada pelo backend com base nas estratégias concluídas '
            'e nas evidências disponíveis.',
        ])
        combined_synthesis = '\n'.join(lines)
    else:
        combined_synthesis = (
            '## Resposta direta\n\n'
            'Não foi possível produzir uma resposta sustentada com as evidências disponíveis nesta execução.\n\n'
            '## Limitação da síntese\n\n'
            'As análises individuais não forneceram claims com evidência válida e confiança '
            'suficiente para formar uma resposta de contingência.'
        )

    return {
        'shared_main_topic': _short_text(analyses[0].get('main_topic'), 500) if analyses else '',
        'consensus_claims': [],
        'equivalent_claims': [],
        'unique_claims_by_strategy': {},
        'contradictions': [],
        'coverage_gaps': [],
        'unsupported_claims': [],
        'synthesis_status': 'invalid' if fallback_reliability == 'insuficiente' else 'partial',
        'reliability': fallback_reliability,
        'reliability_hint': reliability_hint,
        'synthesis_reason': reason,
        'combined_synthesis': combined_synthesis,
        'fallback_used': True,
        'fallback_reason': 'A síntese comparativa não pôde ser concluída.',
    }


def _synthesis_prompt(
    question: str,
    analyses: list[dict],
    locale: str | None,
    ultra_compact: bool = False,
    reliability_hint: dict | None = None,
) -> str:
    envelope = {
        'task': {
            'question': question,
            'locale': _normalize_locale(locale),
            'strategies_requested': [analysis.get('strategy') for analysis in analyses if analysis.get('strategy')],
        },
        'reliability_hint': reliability_hint or calculate_reliability_hint(analyses),
        'executions': _compact_synthesis_payload(analyses, ultra_compact=ultra_compact),
    }
    payload = json.dumps(
        envelope,
        ensure_ascii=False,
        default=str,
    )
    return _SYNTHESIS_PROMPT.format(
        n=len(analyses),
        language_instruction=_language_instruction(locale),
        synthesis_payload=payload,
    )


def _chunks_preview(chunks: list[dict]) -> str:
    # Keep the identity-bearing package. A short free-text preview caused the
    # auditor to lose section, sentence and provenance information.
    return json.dumps(_compact_evidence_ledger(chunks), ensure_ascii=False, default=str)


async def _generate_json(provider, prompt: str) -> dict:
    """Usa JSON estruturado quando o adaptador oferece o contrato novo."""
    generate_json = getattr(provider, 'generate_json', None)
    if callable(generate_json):
        return await generate_json(prompt)
    return _parse_json_object(await provider.chat(prompt))


async def _generate_json_with_usage(provider, prompt: str) -> tuple[dict, dict]:
    generate_json_with_usage = getattr(provider, 'generate_json_with_usage', None)
    if callable(generate_json_with_usage):
        value, usage = await generate_json_with_usage(prompt)
        return value, usage
    generate_json = getattr(provider, 'generate_json', None)
    if callable(generate_json):
        return await generate_json(prompt), unknown_usage(operation='audit')
    return _parse_json_object(await provider.chat(prompt)), unknown_usage(operation='audit')


async def analyze_execution(payload: dict) -> dict:
    """Interpreta uma execução (resposta bruta + contexto) → análise estruturada."""
    provider = ProviderFactory.create(get_active_provider())
    compact_ledger = _compact_evidence_ledger(
        payload.get('evidence_ledger') or payload.get('evidence_package') or payload.get('chunks') or []
    )
    audit_payload = {
        'task': {
            'question': payload.get('question', ''),
            'strategy': payload.get('strategy'),
            'locale': _normalize_locale(payload.get('locale')),
        },
        'answer_under_audit': {
            'raw_answer': payload.get('raw_answer', ''),
        },
        'evidence_ledger': compact_ledger,
        'system_metadata': {'retrieval_quality': payload.get('retrieval_quality') or {}, 'strategy': payload.get('strategy')},
    }
    prompt = _ANALYSIS_PROMPT.format(
        language_instruction=_language_instruction(payload.get('locale')),
        audit_payload=json.dumps(audit_payload, ensure_ascii=False, default=str),
    )
    analysis, token_usage = await _generate_json_with_usage(provider, prompt)
    token_usage = dict(token_usage or {})
    token_usage['operation'] = 'audit'
    analysis.setdefault('main_topic', '')
    analysis.setdefault('claims', [])
    analysis.setdefault('subtopics', [])
    analysis.setdefault('conclusions', [])
    analysis.setdefault('information_omitted_from_answer', [])
    analysis.setdefault('unsupported_claims', [])
    analysis.setdefault('limitations', [])
    for index, claim in enumerate(analysis.get('claims') or []):
        if isinstance(claim, dict):
            claim.setdefault('claim_id', f'claim_{index + 1:03d}')
            claim.setdefault('evidence_ids', [])
            claim.setdefault('section_ids', [])
            claim.setdefault('source', 'document' if claim.get('grounded') else 'inference')
    analysis['evidence_ledger'] = compact_ledger
    analysis['strategy'] = payload.get('strategy')
    analysis = normalize_analysis_claims(analysis, {item['evidence_id'] for item in compact_ledger if item.get('evidence_id')})
    if not analysis.get('main_topic') and not analysis.get('claims'):
        fallback_topic = _fallback_topic(payload.get('raw_answer', ''))
        if fallback_topic:
            analysis['main_topic'] = fallback_topic
            analysis['limitations'] = list(analysis.get('limitations') or [])
            analysis['limitations'].append(
                'A auditoria estruturada não registrou claims; o resumo foi preservado da resposta completa.'
            )
            analysis['audit_fallback'] = True
    analysis['token_usage'] = token_usage
    analysis['usage_known'] = bool(token_usage.get('known'))
    return analysis


async def build_comparison(
    provider: str,
    question: str,
    analyses: list[dict],
    locale: str | None = None,
    reliability_hint: dict | None = None,
) -> dict:
    """Compara as análises das estratégias e produz a síntese semântica."""
    provider = get_active_provider()
    provider_obj = ProviderFactory.create(provider)
    reliability_hint = reliability_hint or calculate_reliability_hint(analyses)
    prompt = _synthesis_prompt(question, analyses, locale, reliability_hint=reliability_hint)
    synthesis_usages = []
    try:
        result, usage = await _generate_json_with_usage(provider_obj, prompt)
        synthesis_usages.append(usage)
    except Exception as exc:
        logger.warning('Falha na primeira síntese da comparação; tentando pacote mínimo: %s', exc)
        synthesis_usages.append(unknown_usage(provider=provider, operation='synthesis'))
        try:
            result, usage = await _generate_json_with_usage(
                provider_obj,
                _synthesis_prompt(question, analyses, locale, ultra_compact=True, reliability_hint=reliability_hint),
            )
            synthesis_usages.append(usage)
        except Exception as retry_exc:
            logger.error('Falha definitiva no LLM da comparação: %s', retry_exc)
            fallback = _fallback_comparison(
                analyses,
                f'Falha no LLM de comparação; síntese de contingência usada: {retry_exc}',
                reliability_hint=reliability_hint,
            )
            fallback['synthesis_error_type'] = 'generation_error'
            return normalize_comparison_result(fallback, analyses)
    if not isinstance(result, dict) or not result:
        logger.warning('Síntese vazia; tentando pacote mínimo.')
        synthesis_usages.append(unknown_usage(provider=provider, operation='synthesis'))
        try:
            result, usage = await _generate_json_with_usage(
                provider_obj,
                _synthesis_prompt(question, analyses, locale, ultra_compact=True, reliability_hint=reliability_hint),
            )
            synthesis_usages.append(usage)
        except Exception as retry_exc:
            fallback = _fallback_comparison(
                analyses,
                f'Falha no LLM de comparação; síntese de contingência usada: {retry_exc}',
                reliability_hint=reliability_hint,
            )
            fallback['synthesis_error_type'] = 'json_parse'
            return normalize_comparison_result(fallback, analyses)
    result.setdefault('shared_main_topic', '')
    result.setdefault('consensus_claims', [])
    result.setdefault('equivalent_claims', [])
    result.setdefault('unique_claims_by_strategy', {})
    result.setdefault('contradictions', [])
    result.setdefault('coverage_gaps', [])
    result.setdefault('unsupported_claims', [])
    reliability = reliability_hint.get('classification') or 'insuficiente'
    result['reliability'] = reliability
    result['reliability_hint'] = reliability_hint
    result['synthesis_status'] = _status_for_reliability(reliability)
    result.setdefault('synthesis_reason', '')
    result.setdefault('combined_synthesis', '')
    result['token_usage'] = combine_usage(synthesis_usages, operation='synthesis')
    result['usage_known'] = bool(result['token_usage'].get('known'))
    result = normalize_comparison_result(result, analyses)
    if not result.get('combined_synthesis') and any(_has_supported_claims(analysis) for analysis in analyses):
        fallback = _fallback_comparison(
            analyses,
            'Síntese textual de contingência usada porque o LLM não retornou combined_synthesis.',
            reliability_hint=reliability_hint,
        )
        result['combined_synthesis'] = fallback.get('combined_synthesis', '')
        result['fallback_used'] = True
        result['fallback_reason'] = fallback.get('fallback_reason', 'A síntese comparativa não pôde ser concluída.')
        if not result.get('synthesis_reason'):
            result['synthesis_reason'] = fallback.get('synthesis_reason', '')
    return result
