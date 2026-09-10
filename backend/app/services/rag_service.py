import json
import logging
import uuid
from time import perf_counter

from sqlalchemy.orm import Session

from app.models.document import Document
from app.providers.base import GenerationResult, ProviderConfigurationError, ProviderRequestError, combine_usage, unknown_usage
from app.rag.strategies import build_chroma_where
from app.schemas.rag import RAGQueryRequest
from app.services import runtime_settings
from app.services.execution_service import ExecutionService
from app.services.provider_factory import ProviderFactory
from app.services.rag_factory import RAGFactory

PRIMARY_QUOTE_LIMIT = 2400
SECONDARY_QUOTE_LIMIT = 900
logger = logging.getLogger(__name__)


def _to_float(value):
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def _normal_score(value):
    numeric = _to_float(value)
    return None if numeric is None else max(0.0, min(1.0, numeric))


def _structured_chunk(hit: dict, rank: int) -> dict:
    meta = hit.get('metadata') or {}
    document_id = meta.get('document_id') or hit.get('document_id')
    chunk_index = meta.get('chunk_index')
    chunk_id = meta.get('chunk_id') or hit.get('chunk_id') or f'{document_id or "doc"}:{chunk_index or rank}'
    return {
        'chunkId': str(chunk_id),
        'chunk_id': str(chunk_id),
        'rank': rank,
        'documentId': None if document_id is None else str(document_id),
        'document_id': None if document_id is None else str(document_id),
        'filename': hit.get('filename') or meta.get('filename') or 'sem arquivo',
        'chunkIndex': chunk_index,
        'chunk_index': chunk_index,
        'text': hit.get('text') or '',
        'score': _normal_score(hit.get('score')),
        'vectorScore': _normal_score(hit.get('vector_score')),
        'vector_score': _normal_score(hit.get('vector_score')),
        'lexicalScore': _normal_score(hit.get('lexical_score')),
        'lexical_score': _normal_score(hit.get('lexical_score')),
        'metadata': meta,
        'origin': hit.get('origin') or 'vector',
        'evidenceIds': list(hit.get('evidence_ids') or meta.get('evidence_ids') or []),
    }


def _compact_quote(text: str | None, rank: int) -> str:
    value = (text or '').strip()
    limit = PRIMARY_QUOTE_LIMIT if rank <= 20 else SECONDARY_QUOTE_LIMIT
    return value if len(value) <= limit else value[:limit].rstrip() + ' [...]'


def _chunk_value(chunk: dict, *names: str):
    for name in names:
        value = chunk.get(name)
        if value is not None:
            return value
    return None


def _evidence_package(chunks: list[dict]) -> list[dict]:
    package = []
    seen_ids: set[str] = set()
    for index, chunk in enumerate(chunks):
        rank = int(_chunk_value(chunk, 'rank') or index + 1)
        chunk_id = _chunk_value(chunk, 'chunkId', 'chunk_id') or f'chunk:{rank}'
        evidence_ids = list(_chunk_value(chunk, 'evidenceIds', 'evidence_ids') or [])
        base_id = str(evidence_ids[0]) if evidence_ids else f'chunk:{chunk_id}'
        evidence_id = base_id if base_id not in seen_ids else f'{base_id}#{rank}'
        seen_ids.add(evidence_id)
        package.append({
            'evidence_id': evidence_id,
            'source_evidence_id': base_id,
            'document_id': _chunk_value(chunk, 'documentId', 'document_id'),
            'filename': chunk.get('filename'),
            'chunk_id': str(chunk_id),
            'quote': _compact_quote(_chunk_value(chunk, 'text', 'quote'), rank),
            'origin': chunk.get('origin') or 'vector',
            'score': _chunk_value(chunk, 'score', 'confidence'),
        })
    return package


def _query_prompt(payload: RAGQueryRequest, filters: dict, evidence_package: list[dict]) -> str:
    envelope = {
        'task': {
            'question': payload.question,
            'strategy': payload.strategy,
            'provider': payload.provider,
            'locale': payload.locale or 'pt-BR',
            'top_k_retrieved': len(evidence_package),
            'filters': filters,
        },
        'evidence_package': evidence_package,
    }
    return (
        'Você é um investigador documental. Responda exatamente à pergunta em task.question usando apenas evidence_package.\n\n'
        'REGRAS: use somente as evidências fornecidas; não use conhecimento externo; não invente fatos, IDs ou citações; '
        'diferencie fatos, interpretações e lacunas; toda claim factual deve apontar para evidence_ids válidos; '
        'não diga que a pergunta não foi fornecida quando ela estiver preenchida.\n\n'
        'Responda apenas com JSON válido no formato: '
        '{"answer_text":"...","claims":[{"claim_id":"claim_001","text":"...","type":"fact|interpretation|conclusion",'
        '"grounded":true,"evidence_ids":[],"confidence":0.0}],'
        '"unsupported_claims":[],"limitations":[]}\n\n'
        f'{"Escreva em inglês." if str(payload.locale).lower().startswith("en") else "Escreva em português brasileiro."}\n\n'
        f'PACOTE DA TAREFA:\n{json.dumps(envelope, ensure_ascii=False, default=str)}'
    )


def _parse_json_object(text: str) -> dict:
    if not text:
        return {}
    cleaned = str(text).strip()
    if cleaned.startswith('```'):
        cleaned = cleaned.strip('`').strip()
        if cleaned.lower().startswith('json'):
            cleaned = cleaned[4:].strip()
    start, end = cleaned.find('{'), cleaned.rfind('}')
    if start < 0 or end <= start:
        return {}
    try:
        value = json.loads(cleaned[start:end + 1])
        return value if isinstance(value, dict) else {}
    except (TypeError, json.JSONDecodeError):
        return {}


async def _generate_answer_json_with_usage(provider, prompt: str) -> tuple[dict, str, dict]:
    async def narrative_fallback(error: Exception, previous_usage: dict | None = None):
        logger.warning('Falha na resposta JSON estruturada; usando resposta narrativa: %s', error)
        fallback_prompt = prompt + '\n\nResponda agora em Markdown legível, mantendo as regras de fonte.'
        chat_with_usage = getattr(provider, 'chat_with_usage', None)
        if callable(chat_with_usage):
            result = await chat_with_usage(fallback_prompt)
            raw = result.text if isinstance(result, GenerationResult) else result.get('text', '')
            usage = result.usage if isinstance(result, GenerationResult) else result.get('usage', unknown_usage(operation='generation'))
        else:
            raw = await provider.chat(fallback_prompt)
            usage = unknown_usage(operation='generation')
        if not isinstance(raw, str) or not raw.strip():
            raise ProviderRequestError('O provedor não retornou uma resposta textual.', code='empty_response')
        return {}, raw, combine_usage([previous_usage, usage] if previous_usage else [usage], operation='generation')

    generator = getattr(provider, 'generate_json_with_usage', None)
    if callable(generator):
        try:
            value, usage = await generator(prompt)
            if isinstance(value, dict) and isinstance(value.get('answer_text') or value.get('answer'), str):
                value = dict(value)
                value.setdefault('answer_text', value.get('answer'))
                return value, '', usage
            return await narrative_fallback(ProviderRequestError('JSON sem answer_text.', code='empty_answer'), usage)
        except Exception as exc:
            return await narrative_fallback(exc)

    generator = getattr(provider, 'generate_json', None)
    if callable(generator):
        try:
            value = await generator(prompt)
            if isinstance(value, dict) and isinstance(value.get('answer_text') or value.get('answer'), str):
                value = dict(value)
                value.setdefault('answer_text', value.get('answer'))
                return value, '', unknown_usage(operation='generation')
            return await narrative_fallback(ProviderRequestError('JSON sem answer_text.', code='empty_answer'))
        except Exception as exc:
            return await narrative_fallback(exc)

    chat_with_usage = getattr(provider, 'chat_with_usage', None)
    if callable(chat_with_usage):
        result = await chat_with_usage(prompt)
        raw = result.text if isinstance(result, GenerationResult) else result.get('text', '')
        usage = result.usage if isinstance(result, GenerationResult) else result.get('usage', unknown_usage(operation='generation'))
    else:
        raw = await provider.chat(prompt)
        usage = unknown_usage(operation='generation')
    if not isinstance(raw, str) or not raw.strip():
        raise ProviderRequestError('O provedor não retornou uma resposta textual.', code='empty_response')
    return _parse_json_object(raw), raw, usage


def _validate_answer_payload(payload: dict, ledger: list[dict]) -> dict:
    allowed = {str(item.get('evidence_id')) for item in ledger if item.get('evidence_id')}
    claims = []
    unsupported = list(payload.get('unsupported_claims') or []) if isinstance(payload, dict) else []
    for index, claim in enumerate(payload.get('claims') or [] if isinstance(payload, dict) else []):
        if not isinstance(claim, dict):
            continue
        ids = [str(value) for value in claim.get('evidence_ids') or [] if str(value) in allowed]
        normalized = {**claim, 'claim_id': claim.get('claim_id') or f'claim_{index + 1:03d}', 'evidence_ids': ids}
        normalized['grounded'] = bool(claim.get('grounded')) and bool(ids)
        if claim.get('grounded') and not normalized['grounded']:
            unsupported.append({'claim_id': normalized['claim_id'], 'text': claim.get('text') or '', 'reason': 'Claim sem evidence_id válido.'})
        claims.append(normalized)
    return {
        'claims': claims,
        'unsupported_claims': unsupported,
        'limitations': [str(item) for item in (payload.get('limitations') or [])] if isinstance(payload, dict) else [],
        'answer_grounding_status': 'grounded' if any(item.get('grounded') for item in claims) else 'ungrounded',
    }


def _complete_answer_text(payload: dict, audited_claims: list[dict], raw_answer: str) -> str:
    base = str(payload.get('answer_text') or payload.get('answer') or raw_answer or '').strip()
    parts = [base] if base else []
    missing = [claim for claim in audited_claims if claim.get('grounded') and str(claim.get('text') or '').strip() not in base]
    if missing:
        parts.append('### Afirmações fundamentadas')
        parts.extend(f"- {claim['text'].strip()}" for claim in missing)
    unsupported = [item for item in (payload.get('unsupported_claims') or []) if isinstance(item, dict) and str(item.get('text') or '').strip()]
    if unsupported:
        parts.append('### Pontos não confirmados')
        parts.extend(f"- {item['text'].strip()}" for item in unsupported)
    limitations = [str(item).strip() for item in (payload.get('limitations') or []) if str(item).strip()]
    if limitations:
        parts.append('### Limitações')
        parts.extend(f'- {item}' for item in limitations)
    return '\n\n'.join(parts)


async def _retrieve_with_top_k(strategy, question: str, filters: dict | None, top_k: int, provider: str) -> list[dict]:
    return await strategy.retrieve(question, filters=filters, top_k=top_k, provider=provider)


class RAGService:
    @staticmethod
    async def run_query(db: Session, payload: RAGQueryRequest, *, resolved_scope=None):
        payload = payload.model_copy(update={'provider': runtime_settings.get_active_provider()})
        from app.services.document_scope import check_available, resolve_documents, retrieval_scope, validate_evidence_scope
        scope = resolved_scope or resolve_documents(
            db, provider=payload.provider, strategies=[payload.strategy],
            document_scope=payload.document_scope, document_ids=payload.document_ids,
            content_type_filter=payload.content_type_filter, status_filter=payload.status_filter,
        )
        strategy = RAGFactory.create(payload.strategy)
        provider = ProviderFactory.create_for_rag(payload.provider)
        generation_model = getattr(provider, 'model', None) or runtime_settings.get_provider_model(payload.provider)
        embedding_model = runtime_settings.get_provider_embedding_model(payload.provider)
        filters = {'content_type': payload.content_type_filter, 'status': payload.status_filter, 'document_scope': scope.public()}
        total_started = perf_counter()
        retrieval_started = perf_counter()
        check_available(db, scope)
        with retrieval_scope(scope):
            hits = await _retrieve_with_top_k(strategy, payload.question, scope.filters, payload.top_k, payload.provider)
        hits = (hits or [])[:payload.top_k]
        validate_evidence_scope(hits, scope)
        retrieval_ms = round((perf_counter() - retrieval_started) * 1000, 2)
        chunks = [_structured_chunk(item, index + 1) for index, item in enumerate(hits)]
        used_documents = validate_evidence_scope(chunks, scope)
        evidence_package = _evidence_package(chunks)
        validate_evidence_scope(evidence_package, scope)
        check_available(db, scope)
        prompt = _query_prompt(payload, filters, evidence_package)
        logger.info('rag_diagnostic strategy=%s filters=%s hits=%d', payload.strategy, filters, len(hits))
        llm_started = perf_counter()
        structured_answer, raw_answer, token_usage = await _generate_answer_json_with_usage(provider, prompt)
        audit = _validate_answer_payload(structured_answer, evidence_package)
        answer = _complete_answer_text(structured_answer, audit['claims'], raw_answer)
        if not structured_answer:
            audit['answer_grounding_status'] = 'unstructured'
        llm_ms = round((perf_counter() - llm_started) * 1000, 2)
        total_ms = round((perf_counter() - total_started) * 1000, 2)
        metrics = {
            'total_ms': total_ms, 'retrieval_ms': retrieval_ms, 'llm_ms': llm_ms,
            'totalMs': total_ms, 'retrievalMs': retrieval_ms, 'llmMs': llm_ms,
            'chunk_count': len(chunks), 'source_count': len({item['filename'] for item in chunks}),
            'answer_length': len(answer), 'prompt_tokens': token_usage.get('prompt_tokens'),
            'output_tokens': token_usage.get('output_tokens'), 'total_tokens': token_usage.get('total_tokens'),
            'usage_known': bool(token_usage.get('known')),
        }
        execution_id = f'exec_{uuid.uuid4().hex[:10]}'
        sources = sorted({item['filename'] for item in chunks if item.get('filename')})
        ExecutionService.log(db, payload.question, payload.strategy, payload.provider, answer, sources,
                             generation_model=generation_model, embedding_model=embedding_model)
        return {
            'execution_id': execution_id, 'document_scope': scope.public(used_documents), 'answer': answer,
            'strategy': payload.strategy, 'provider': payload.provider, 'generation_model': generation_model,
            'embedding_model': embedding_model, 'sources': sources, 'chunks': chunks, 'metrics': metrics,
            'token_usage': token_usage, 'evidence_package': evidence_package, 'evidence_ledger': evidence_package,
            **audit, 'raw_answer': raw_answer or None,
        }
