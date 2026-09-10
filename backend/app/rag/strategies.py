import logging
import json
import re
from collections import defaultdict
from pathlib import Path

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.document import Document
from app.services.chroma_service import ChromaService
from app.services.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)


def build_chroma_where(filters: dict | None) -> dict | None:
    if not filters:
        return None
    if '$and' in filters or '$or' in filters:
        return filters
    conditions = []
    for key, value in filters.items():
        if value in [None, '', [], {}]:
            continue
        if isinstance(value, dict):
            conditions.append({key: value})
        else:
            conditions.append({key: {'$eq': value}})
    if not conditions:
        return None
    if len(conditions) == 1:
        return conditions[0]
    return {'$and': conditions}


def merge_filters(filters: dict | None, extra: dict | None) -> dict | None:
    base_where = build_chroma_where(filters)
    extra_where = build_chroma_where(extra)
    if not base_where:
        return extra_where
    if not extra_where:
        return base_where
    return {'$and': [base_where, extra_where]}


def distance_to_similarity(distance) -> float:
    try:
        value = float(distance)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, 1.0 - value)


def tokenize(text: str) -> set[str]:
    return set(re.findall(r'[\wÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇáàâãéèêíìîóòôõúùûç-]+', text.lower()))


def lexical_score(question: str, text: str) -> float:
    question_tokens = tokenize(question)
    text_tokens = tokenize(text)
    if not question_tokens or not text_tokens:
        return 0.0
    return len(question_tokens & text_tokens) / len(question_tokens | text_tokens)


def hit_key(hit: dict):
    meta = hit.get('metadata') or {}
    return meta.get('chunk_id') or (meta.get('filename'), hit.get('text'))


def dedupe_hits(hits: list[dict], top_k: int) -> list[dict]:
    unique = []
    seen = set()
    for hit in hits:
        key = hit_key(hit)
        if key not in seen:
            unique.append(hit)
            seen.add(key)
        if len(unique) >= top_k:
            break
    return unique


async def query_chroma(
    question: str,
    n_results: int,
    filters: dict | None = None,
    provider: str | None = None,
) -> list[dict]:
    collection = ChromaService.collection()
    query_embeddings = await EmbeddingService.embed([question], provider=provider)
    if not query_embeddings or len(query_embeddings) == 0:
        raise ValueError('Embedding da pergunta e invalido')
    results = collection.query(
        query_embeddings=query_embeddings[0],
        n_results=n_results,
        where=build_chroma_where(filters),
    )
    return [
        {
            'text': doc,
            'metadata': meta,
            'score': distance_to_similarity(distance),
            'distance': distance,
        }
        for doc, meta, distance in zip(
            results.get('documents', [[]])[0],
            results.get('metadatas', [[]])[0],
            results.get('distances', [[]])[0],
        )
    ]


class BaseStrategy:
    name = 'base'

    async def retrieve(self, question: str, filters: dict | None = None, top_k: int = 10, provider: str | None = None):
        return []


class VectorStrategy(BaseStrategy):
    name = 'vector'

    async def retrieve(self, question: str, filters: dict | None = None, top_k: int = 10, provider: str | None = None):
        return await query_chroma(question, n_results=top_k, filters=filters, provider=provider)


class HybridStrategy(BaseStrategy):
    name = 'hybrid'

    async def retrieve(self, question: str, filters: dict | None = None, top_k: int = 10, provider: str | None = None):
        collection = ChromaService.collection()
        vector_hits = await query_chroma(question, n_results=top_k, filters=filters, provider=provider)
        logger.info(
            'rag_diagnostic strategy=hybrid chroma_where=%s vector_candidates=%d',
            build_chroma_where(filters),
            len(vector_hits),
        )
        text_results = collection.get(
            where=build_chroma_where(filters),
            limit=20,
        )
        logger.info(
            'rag_diagnostic strategy=hybrid lexical_candidates=%d',
            len(text_results.get('documents', []) or []),
        )

        combined = []
        for hit in vector_hits:
            score = hit['score']
            combined.append({
                **hit,
                'vector_score': score,
                'lexical_score': lexical_score(question, hit['text']),
                'score': score,
            })

        vector_keys = {hit_key(hit) for hit in combined}
        for doc, meta in zip(text_results.get('documents', []), text_results.get('metadatas', [])):
            candidate = {'text': doc, 'metadata': meta}
            if hit_key(candidate) in vector_keys:
                continue
            lex = lexical_score(question, doc)
            combined.append({
                'text': doc,
                'metadata': meta,
                'score': lex,
                'vector_score': 0.0,
                'lexical_score': lex,
            })

        combined.sort(
            key=lambda item: item.get('vector_score', 0.0) * 0.7 + item.get('lexical_score', 0.0) * 0.3,
            reverse=True,
        )
        final_hits = dedupe_hits(combined, top_k=top_k)
        logger.info('rag_diagnostic strategy=hybrid hits_finais=%d', len(final_hits))
        return final_hits


