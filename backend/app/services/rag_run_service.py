import json
import uuid
from time import perf_counter

from sqlalchemy.orm import Session

from app.models.pipeline import PipelineEvent, PipelineRun, PipelineRunResult
from app.schemas.rag import RAGQueryRequest, RAGRunRequest
from app.services import semantic_analyzer
from app.services.rag_service import RAGService
from app.services.document_scope import resolve_documents
from app.services.runtime_settings import get_active_provider, get_provider_embedding_model, get_provider_model

_STAGE_LABELS = {
    'queued': 'Run enfileirado',
    'embedding': 'Embedding',
    'retrieval': 'Retrieval',
    'generation': 'Generation',
    'semantic_analysis': 'Analise semantica',
    'completed': 'Run concluido',
}


def _new_run_id() -> str:
    return f'run_{uuid.uuid4().hex[:12]}'


def _json_dump(value) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def _json_load(value, default):
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def _event(sequence: int, stage: str, status: str, strategy: str | None = None, duration_ms: float | None = None, error_code: str | None = None) -> dict:
    label = _STAGE_LABELS.get(stage, stage)
    if strategy:
        label = f'{label}: {strategy}'
    return {
        'id': f'evt_{sequence}',
        'stage': stage,
        'status': status,
        'sequence': sequence,
        'label': label,
        'strategy': strategy,
        'durationMs': duration_ms,
        'errorCode': error_code,
    }


class RAGRunService:
    @staticmethod
    def _append_event(
        db: Session,
        run_id: str,
        events: list[dict],
        stage: str,
        status: str,
        strategy: str | None = None,
        duration_ms: float | None = None,
        error_code: str | None = None,
    ) -> dict:
        event = _event(len(events), stage, status, strategy, duration_ms, error_code)
        event['id'] = f'{run_id}_evt_{event["sequence"]}'
        events.append(event)
        db.add(PipelineEvent(
            event_id=event['id'],
            run_id=run_id,
            stage=event['stage'],
            status=event['status'],
            sequence=event['sequence'],
            label=event['label'],
            strategy=event.get('strategy'),
            duration_ms=duration_ms,
            error_code=event.get('errorCode'),
        ))
        db.commit()
        return event

    @staticmethod
    def _persist_run_state(db: Session, row: PipelineRun, run: dict) -> None:
        row.status = run['status']
        row.active_stage = run.get('active_stage')
        row.synthesis_json = _json_dump(run.get('synthesis')) if run.get('synthesis') is not None else None
        row.errors_json = _json_dump(run.get('errors', []))
        db.commit()

    @staticmethod
    async def create_run(db: Session, payload: RAGRunRequest) -> dict:
        payload = payload.model_copy(update={'provider': get_active_provider()})
        scope = resolve_documents(
            db, provider=payload.provider, strategies=payload.strategies,
            document_scope=payload.document_scope, document_ids=payload.document_ids,
            content_type_filter=payload.content_type_filter, status_filter=payload.status_filter,
        )
        run_id = _new_run_id()
        run = {
            'run_id': run_id,
            'mode': payload.mode,
            'status': 'running',
            'active_stage': 'queued',
            'question': payload.question,
            'provider': payload.provider,
            'generation_model': get_provider_model(payload.provider),
            'embedding_model': get_provider_embedding_model(payload.provider),
            'locale': payload.locale,
            'strategies': payload.strategies,
            'results': [],
            'synthesis': None,
            'events': [],
            'errors': [],
        }
        row = PipelineRun(
            run_id=run_id,
            mode=payload.mode,
            status=run['status'],
            active_stage=run['active_stage'],
            question=payload.question,
            provider=payload.provider,
            strategies_json=_json_dump(payload.strategies),
            config_json=_json_dump({
                'top_k': payload.top_k,
                'locale': payload.locale,
                'content_type_filter': payload.content_type_filter,
                'status_filter': payload.status_filter,
                'document_scope': scope.public(),
            }),
            errors_json='[]',
        )
        db.add(row)
        db.commit()
        RAGRunService._append_event(db, run_id, run['events'], 'queued', 'completed')

        for strategy in payload.strategies:
            started = perf_counter()
            run['active_stage'] = 'retrieval'
            RAGRunService._persist_run_state(db, row, run)
            RAGRunService._append_event(db, run_id, run['events'], 'embedding', 'completed', strategy)
            RAGRunService._append_event(db, run_id, run['events'], 'retrieval', 'running', strategy)
            try:
                result = await RAGService.run_query(
                    db,
                    RAGQueryRequest(
                        question=payload.question,
                        strategy=strategy,
                        provider=payload.provider,
                        locale=payload.locale,
                        top_k=payload.top_k,
                        content_type_filter=payload.content_type_filter,
                        status_filter=payload.status_filter,
                    ),
                    resolved_scope=scope,
                )
                duration = round((perf_counter() - started) * 1000, 2)
                RAGRunService._append_event(db, run_id, run['events'], 'retrieval', 'completed', strategy, duration)
                RAGRunService._append_event(db, run_id, run['events'], 'generation', 'completed', strategy, result['metrics'].get('llm_ms'))
                run['results'].append(result)
                db.add(PipelineRunResult(
                    run_id=run_id,
                    execution_id=result.get('execution_id'),
                    strategy=result.get('strategy') or strategy,
                    result_json=_json_dump(result),
                ))
                db.commit()
            except Exception as exc:
                run['status'] = 'failed'
                run['active_stage'] = 'failed'
                code = exc.__class__.__name__
                RAGRunService._append_event(db, run_id, run['events'], 'generation', 'failed', strategy, error_code=code)
                run['errors'].append({
                    'stage': 'generation',
                    'strategy': strategy,
                    'code': code,
                    'message': str(exc)[:500],
                    'run_id': run_id,
                })
                RAGRunService._persist_run_state(db, row, run)
                break

        if run['status'] != 'failed' and payload.mode == 'comparison' and len(run['results']) >= 2:
            run['active_stage'] = 'semantic_analysis'
            RAGRunService._persist_run_state(db, row, run)
            RAGRunService._append_event(db, run_id, run['events'], 'semantic_analysis', 'running')
            try:
                analyses = []
                for result in run['results']:
                    analyses.append(await semantic_analyzer.analyze_execution({
                        'provider': payload.provider,
                        'question': payload.question,
                        'raw_answer': result['answer'],
                        'chunks': result['chunks'],
                        'strategy': result['strategy'],
                        'locale': payload.locale,
                        'filters': {
                            'content_type': payload.content_type_filter,
                            'status': payload.status_filter,
                        },
                    }))
                synthesis = await semantic_analyzer.build_comparison(
                    payload.provider,
                    payload.question,
                    analyses,
                    locale=payload.locale,
                )
                synthesis['execution_ids'] = [item.get('execution_id') for item in run['results']]
                run['synthesis'] = synthesis
                RAGRunService._append_event(db, run_id, run['events'], 'semantic_analysis', 'completed')
            except Exception as exc:
                run['synthesis'] = {
                    'synthesis_status': 'invalid',
                    'synthesis_reason': f'falha na analise semantica: {exc}',
                    'combined_synthesis': '',
                    'execution_ids': [item.get('execution_id') for item in run['results']],
                }
                RAGRunService._append_event(db, run_id, run['events'], 'semantic_analysis', 'failed', error_code=exc.__class__.__name__)
                run['errors'].append({
                    'stage': 'semantic_analysis',
                    'code': exc.__class__.__name__,
                    'message': str(exc)[:500],
                    'run_id': run_id,
                })

        if run['status'] != 'failed':
            run['status'] = 'completed'
            run['active_stage'] = 'completed'
            RAGRunService._append_event(db, run_id, run['events'], 'completed', 'completed')
        RAGRunService._persist_run_state(db, row, run)
        return RAGRunService.get_run(db, run_id) or run

    @staticmethod
    def get_run(db: Session, run_id: str) -> dict | None:
        row = db.query(PipelineRun).filter(PipelineRun.run_id == run_id).first()
        if not row:
            return None
        results = [
            _json_load(result.result_json, {})
            for result in db.query(PipelineRunResult)
            .filter(PipelineRunResult.run_id == run_id)
            .order_by(PipelineRunResult.id)
            .all()
        ]
        events = RAGRunService.get_events(db, run_id) or []
        generation_model = (
            results[0].get('generation_model')
            if results and isinstance(results[0], dict)
            else None
        ) or get_provider_model(row.provider)
        embedding_model = (
            results[0].get('embedding_model')
            if results and isinstance(results[0], dict)
            else None
        ) or get_provider_embedding_model(row.provider)
        return {
            'run_id': row.run_id,
            'document_scope': {
                **_json_load(row.config_json, {}).get('document_scope', {}),
                'used_document_ids': sorted({
                    value for result in results
                    for value in (result.get('document_scope') or {}).get('used_document_ids', [])
                }),
            } if _json_load(row.config_json, {}).get('document_scope') else None,
            'mode': row.mode,
            'status': row.status,
            'active_stage': row.active_stage,
            'question': row.question,
            'provider': row.provider,
            'generation_model': generation_model,
            'embedding_model': embedding_model,
            'locale': _json_load(row.config_json, {}).get('locale', 'pt-BR'),
            'strategies': _json_load(row.strategies_json, []),
            'results': results,
            'synthesis': _json_load(row.synthesis_json, None),
            'events': events,
            'errors': _json_load(row.errors_json, []),
        }

    @staticmethod
    def get_events(db: Session, run_id: str) -> list[dict] | None:
        if not db.query(PipelineRun.id).filter(PipelineRun.run_id == run_id).first():
            return None
        rows = (
            db.query(PipelineEvent)
            .filter(PipelineEvent.run_id == run_id)
            .order_by(PipelineEvent.sequence)
            .all()
        )
        return [{
            'id': row.event_id,
            'stage': row.stage,
            'status': row.status,
            'sequence': row.sequence,
            'label': row.label,
            'strategy': row.strategy,
            'durationMs': row.duration_ms,
            'errorCode': row.error_code,
        } for row in rows]
