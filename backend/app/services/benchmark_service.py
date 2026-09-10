from sqlalchemy.orm import Session
from app.schemas.benchmark import BenchmarkCompareRequest, BenchmarkRequest
from app.schemas.rag import RAGQueryRequest
from app.services.rag_service import RAGService
from app.services.runtime_settings import get_active_provider, get_provider_embedding_model, get_provider_model

class BenchmarkService:
    NO_EXPECTED_KEYWORDS_WARNING = (
        'Benchmark sem palavras esperadas em uma ou mais perguntas; '
        'esses itens nao entram na media.'
    )
    NO_EVALUABLE_ITEMS_WARNING = (
        'Benchmark sem criterios avaliaveis: informe palavras esperadas apos TAB.'
    )

    @staticmethod
    async def run(db: Session, payload: BenchmarkRequest):
        payload = payload.model_copy(update={'provider': get_active_provider()})
        items = []
        scores = []
        skipped = 0
        generation_model = None
        embedding_model = None
        for item in payload.items:
            result = await RAGService.run_query(db, RAGQueryRequest(
                question=item.question,
                strategy=payload.strategy,
                provider=payload.provider,
                locale=payload.locale,
                top_k=10,
                content_type_filter=payload.content_type_filter,
                status_filter=payload.status_filter,
            ))
            generation_model = result.get('generation_model') or generation_model
            embedding_model = result.get('embedding_model') or embedding_model
            answer_lower = result['answer'].lower()
            hits = sum(1 for keyword in item.expected_keywords if keyword.lower() in answer_lower)
            total = len(item.expected_keywords)
            ratio = (hits / total) if total else None
            if ratio is None:
                skipped += 1
            else:
                scores.append(ratio)
            items.append({
                'question': item.question,
                'answer_preview': result['answer'][:240],
                'sources': result['sources'],
                'keyword_hits': hits,
                'keyword_total': total,
                'score_ratio': ratio,
                'evaluated': ratio is not None,
            })
        avg = sum(scores) / len(scores) if scores else None
        warning = None
        if skipped == len(payload.items):
            warning = BenchmarkService.NO_EVALUABLE_ITEMS_WARNING
        elif skipped:
            warning = BenchmarkService.NO_EXPECTED_KEYWORDS_WARNING
        return {
            'strategy': payload.strategy,
            'provider': payload.provider,
            'generation_model': generation_model or get_provider_model(payload.provider),
            'embedding_model': embedding_model or get_provider_embedding_model(payload.provider),
            'average_keyword_score': avg,
            'evaluated_items': len(scores),
            'total_items': len(payload.items),
            'warning': warning,
            'items': items,
        }

    @staticmethod
    async def compare(db: Session, payload: BenchmarkCompareRequest):
        payload = payload.model_copy(update={'provider': get_active_provider()})
        rows = []
        primary_scores = []
        secondary_scores = []
        skipped = 0
        generation_model = None
        embedding_model = None

        for item in payload.items:
            primary = await RAGService.run_query(db, RAGQueryRequest(
                question=item.question,
                strategy=payload.primary_strategy,
                provider=payload.provider,
                locale=payload.locale,
                top_k=10,
                content_type_filter=payload.content_type_filter,
                status_filter=payload.status_filter,
            ))
            secondary = await RAGService.run_query(db, RAGQueryRequest(
                question=item.question,
                strategy=payload.secondary_strategy,
                provider=payload.provider,
                locale=payload.locale,
                top_k=10,
                content_type_filter=payload.content_type_filter,
                status_filter=payload.status_filter,
            ))
            generation_model = primary.get('generation_model') or secondary.get('generation_model') or generation_model
            embedding_model = primary.get('embedding_model') or secondary.get('embedding_model') or embedding_model

            primary_hits = sum(1 for keyword in item.expected_keywords if keyword.lower() in primary['answer'].lower())
            secondary_hits = sum(1 for keyword in item.expected_keywords if keyword.lower() in secondary['answer'].lower())
            total = len(item.expected_keywords)
            primary_ratio = (primary_hits / total) if total else None
            secondary_ratio = (secondary_hits / total) if total else None
            evaluated = primary_ratio is not None and secondary_ratio is not None
            if evaluated:
                primary_scores.append(primary_ratio)
                secondary_scores.append(secondary_ratio)
            else:
                skipped += 1

            if not evaluated:
                winner = 'not_evaluated'
            elif primary_ratio > secondary_ratio:
                winner = payload.primary_strategy
            elif secondary_ratio > primary_ratio:
                winner = payload.secondary_strategy
            else:
                winner = 'draw'

            rows.append({
                'question': item.question,
                'primary_score': primary_ratio,
                'secondary_score': secondary_ratio,
                'evaluated': evaluated,
                'winner': winner,
            })

        primary_average = sum(primary_scores) / len(primary_scores) if primary_scores else None
        secondary_average = sum(secondary_scores) / len(secondary_scores) if secondary_scores else None
        if primary_average is None or secondary_average is None:
            winner = 'not_evaluated'
        elif primary_average > secondary_average:
            winner = payload.primary_strategy
        elif secondary_average > primary_average:
            winner = payload.secondary_strategy
        else:
            winner = 'draw'

        warning = None
        if skipped == len(payload.items):
            warning = BenchmarkService.NO_EVALUABLE_ITEMS_WARNING
        elif skipped:
            warning = BenchmarkService.NO_EXPECTED_KEYWORDS_WARNING

        return {
            'provider': payload.provider,
            'generation_model': generation_model or get_provider_model(payload.provider),
            'embedding_model': embedding_model or get_provider_embedding_model(payload.provider),
            'primary_strategy': payload.primary_strategy,
            'secondary_strategy': payload.secondary_strategy,
            'primary_average': primary_average,
            'secondary_average': secondary_average,
            'evaluated_items': len(primary_scores),
            'total_items': len(payload.items),
            'warning': warning,
            'winner': winner,
            'rows': rows,
        }
