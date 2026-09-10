import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.comparison import ComparisonRun, ExecutionAnalysis, RAGExecution, RetrievedChunk, SemanticComparison
from app.providers.base import GenerationResult, ProviderError, combine_usage, unknown_usage
from app.rag.registry import STRATEGY_IDS
from app.schemas.rag import RAGQueryRequest
from app.services import semantic_analyzer
from app.services.document_scope import check_available, resolve_documents, retrieval_scope, validate_evidence_scope
from app.services.markdown_reporter import build_markdown
from app.services.provider_factory import ProviderFactory
from app.services.rag_factory import RAGFactory
from app.services.rag_service import (
    _complete_answer_text,
    _evidence_package,
    _generate_answer_json_with_usage,
    _structured_chunk,
    _validate_answer_payload,
    _retrieve_with_top_k,
)
from app.services.runtime_settings import get_provider_embedding_model, get_provider_model

STATE_RUNNING = 'running'
STATE_COMPLETED = 'completed'
STATE_PARTIAL_FAILED = 'partial_failed'
STATE_OK = 'ok'
STATE_ERROR = 'error'


class ComparisonGroupNotFoundError(Exception):
    pass


class ComparisonGroupRunningError(Exception):
    pass


class ComparisonNoDocumentsError(Exception):
    pass


def _to_json(value, indent=None):
    return json.dumps(value, ensure_ascii=False, indent=indent, default=str)


def _new_group_id():
    return f'cmp_{datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")}-{uuid.uuid4().hex[:4]}'


def _new_execution_id():
    return f'exec_{uuid.uuid4().hex[:10]}'


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _hit_to_chunk(hit: dict) -> dict:
    meta = hit.get('metadata') or {}
    return {
        'chunk_id': meta.get('chunk_id'),
        'document_id': meta.get('document_id'),
        'filename': meta.get('filename'),
        'chunk_index': meta.get('chunk_index'),
        'text': hit.get('text'),
        'score': hit.get('score'),
        'vector_score': hit.get('vector_score'),
        'lexical_score': hit.get('lexical_score'),
        'metadata': meta,
    }


def _atomic_write(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(dir=str(path.parent), prefix='.tmp_', suffix='.out')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    finally:
        if Path(temp_path).exists():
            Path(temp_path).unlink()


def _snapshot(row, question, document_ids, document_filenames, filters, chunks, created_at, quality):
    return {
        'execution_id': row.execution_id,
        'comparison_group_id': row.comparison_group_id,
        'created_at': created_at,
        'question': question,
        'document_ids': document_ids,
        'document_filenames': document_filenames,
        'strategy': row.strategy,
        'provider': row.provider,
        'generation_model': row.generation_model,
        'embedding_model': row.embedding_model,
        'filters': filters,
        'document_scope': quality.get('document_scope'),
        'top_k': row.top_k,
        'raw_answer': row.raw_answer,
        'status': row.status,
        'error': row.error,
        'chunks': chunks,
        'retrieval_quality': quality,
        'token_usage': {
            'prompt_tokens': row.prompt_tokens,
            'output_tokens': row.output_tokens,
            'total_tokens': row.total_tokens,
            'known': bool(row.usage_known),
        } if row.usage_known is not None else None,
    }


class ComparisonService:
    @staticmethod
    async def run_comparison(db: Session, question: str, strategies: list[str] | None = None,
                             provider: str = 'ollama', locale: str = 'pt-BR',
                             content_type_filter: str | None = None, status_filter: str | None = None,
                             top_k: int = 10, document_scope: str = 'all', document_ids: list[str] | None = None):
        provider = provider or 'ollama'
        strategies = list(strategies or STRATEGY_IDS)
        if len(strategies) < 2:
            raise ValueError('Informe duas estratégias diferentes para comparar.')
        if len(strategies) > 2 or any(item not in STRATEGY_IDS for item in strategies) or len(set(strategies)) != len(strategies):
            raise ValueError('A comparação aceita somente Vector e Hybrid, uma vez cada.')
        scope = resolve_documents(
            db, provider=provider, strategies=strategies, document_scope=document_scope,
            document_ids=document_ids, content_type_filter=content_type_filter, status_filter=status_filter,
        )
        document_ids = list(scope.ids)
        document_filenames = list(scope.filenames)
        generation_provider = ProviderFactory.create_for_rag(provider)
        generation_model = getattr(generation_provider, 'model', None) or get_provider_model(provider)
        embedding_model = get_provider_embedding_model(provider)
        group_id = _new_group_id()
        created_at = _now_iso()
        group = ComparisonRun(
            comparison_group_id=group_id, question=question,
            document_ids_json=_to_json(document_ids), document_filenames_json=_to_json(document_filenames),
            status=STATE_RUNNING, version=1,
        )
        db.add(group)
        db.commit()
        db.refresh(group)

        filters = {'content_type': content_type_filter, 'status': status_filter, 'document_scope': scope.public()}
        snapshots = []
        analyses = []
        summary_rows = []
        retrieval_quality = []
        generation_usages = []
        audit_usages = []
        partial = False

        for strategy in strategies:
            row = RAGExecution(
                execution_id=_new_execution_id(), comparison_group_id=group_id, question=question,
                document_ids_json=_to_json(document_ids), document_filenames_json=_to_json(document_filenames),
                strategy=strategy, provider=provider, generation_model=generation_model,
                embedding_model=embedding_model, filters_json=_to_json(filters), top_k=top_k,
                status=STATE_RUNNING,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            chunks = []
            quality = {'strategy': strategy, 'status': 'complete', 'hit_count': 0}
            try:
                check_available(db, scope)
                with retrieval_scope(scope):
                    hits = await _retrieve_with_top_k(RAGFactory.create(strategy), question, scope.filters, top_k, provider)
                hits = hits or []
                validate_evidence_scope(hits, scope)
                structured = [_structured_chunk(hit, index + 1) for index, hit in enumerate(hits)]
                chunks = [_hit_to_chunk(hit) for hit in structured]
                ledger = _evidence_package(structured)
                validate_evidence_scope(ledger, scope)
                quality['hit_count'] = len(hits)
                query = RAGQueryRequest(
                    question=question, strategy=strategy, provider=provider, locale=locale, top_k=top_k,
                    document_scope='selected', document_ids=list(scope.ids),
                    content_type_filter=content_type_filter, status_filter=status_filter,
                )
                from app.services.rag_service import _query_prompt
                prompt = _query_prompt(query, filters, ledger)
                structured_answer, raw_answer, usage = await _generate_answer_json_with_usage(generation_provider, prompt)
                audit = _validate_answer_payload(structured_answer, ledger)
                row.raw_answer = _complete_answer_text(structured_answer, audit['claims'], raw_answer)
                row.prompt_tokens = usage.get('prompt_tokens')
                row.output_tokens = usage.get('output_tokens')
                row.total_tokens = usage.get('total_tokens')
                row.usage_known = bool(usage.get('known'))
                generation_usages.append(usage)
                audit_payload = {
                    'question': question, 'strategy': strategy, 'locale': locale,
                    'raw_answer': row.raw_answer, 'chunks': structured, 'evidence_ledger': ledger,
                    'retrieval_quality': quality,
                }
                analysis = await semantic_analyzer.analyze_execution(audit_payload)
                analysis['strategy'] = strategy
                analysis['evidence_ledger'] = ledger
                audit_usage = analysis.get('token_usage') or unknown_usage(provider=provider, model=generation_model, operation='audit')
                audit_usages.append(audit_usage)
                analyses.append(analysis)
                row.status = STATE_OK
            except Exception as exc:
                partial = True
                row.status = STATE_ERROR
                row.error = str(exc)[:1000]
                usage = unknown_usage(provider=provider, model=generation_model, operation='generation')
                generation_usages.append(usage)
                quality = {'strategy': strategy, 'status': 'failed', 'hit_count': len(chunks), 'error': row.error}
            retrieval_quality.append(quality)
            db.commit()
            db.refresh(row)
            for chunk in chunks:
                db.add(RetrievedChunk(
                    execution_row_id=row.id, chunk_id=chunk['chunk_id'], document_id=chunk['document_id'],
                    filename=chunk['filename'], chunk_index=chunk['chunk_index'], text=chunk['text'],
                    score=None if chunk['score'] is None else str(chunk['score']),
                    vector_score=None if chunk['vector_score'] is None else str(chunk['vector_score']),
                    lexical_score=None if chunk['lexical_score'] is None else str(chunk['lexical_score']),
                    metadata_json=_to_json(chunk['metadata']),
                ))
            db.commit()
            quality['document_scope'] = scope.public(validate_evidence_scope(chunks, scope))
            snapshot = _snapshot(row, question, document_ids, document_filenames, filters, chunks, created_at, quality)
            snapshots.append(snapshot)
            summary_rows.append({
                'execution_id': row.execution_id, 'strategy': strategy, 'status': row.status,
                'error': row.error, 'raw_answer': row.raw_answer, 'document_scope': snapshot['document_scope'],
                'retrieval_quality': quality, 'token_usage': snapshot['token_usage'],
            })
            analysis = next((item for item in reversed(analyses) if item.get('strategy') == strategy), None)
            if analysis:
                db.add(ExecutionAnalysis(
                    execution_row_id=row.id, analysis_json=_to_json(analysis),
                    prompt_tokens=(analysis.get('token_usage') or {}).get('prompt_tokens'),
                    output_tokens=(analysis.get('token_usage') or {}).get('output_tokens'),
                    total_tokens=(analysis.get('token_usage') or {}).get('total_tokens'),
                    usage_known=bool((analysis.get('token_usage') or {}).get('known')),
                ))
        db.commit()

        reliability_hint = semantic_analyzer.calculate_reliability_hint(
            analyses, total_requested=len(strategies), failed=sum(item['status'] == STATE_ERROR for item in summary_rows),
            partial=sum(item['status'] == 'partial' for item in retrieval_quality),
        )
        try:
            comparison = await semantic_analyzer.build_comparison(
                provider, question, analyses, locale=locale, reliability_hint=reliability_hint,
            )
        except Exception as exc:
            partial = True
            comparison = semantic_analyzer._fallback_comparison(analyses, f'falha na comparação: {exc}', reliability_hint)
        comparison = semantic_analyzer.normalize_comparison_result(comparison, analyses)
        comparison['retrieval_quality'] = retrieval_quality
        comparison['document_scope'] = scope.public({
            value for snapshot in snapshots for value in snapshot['document_scope']['used_document_ids']
        })
        comparison['reliability_hint'] = reliability_hint
        synthesis_usage = comparison.get('token_usage') or unknown_usage(provider=provider, model=generation_model, operation='synthesis')
        comparison['token_usage'] = {
            **synthesis_usage,
            'breakdown': {
                'generation': combine_usage(generation_usages, operation='generation'),
                'audit': combine_usage(audit_usages, operation='audit'),
                'synthesis': synthesis_usage,
            },
        }
        group.status = STATE_PARTIAL_FAILED if partial else STATE_COMPLETED
        db.add(SemanticComparison(
            comparison_group_id=group_id, execution_ids_json=_to_json([item['execution_id'] for item in summary_rows if item['status'] == STATE_OK]),
            question=question, result_json=_to_json(comparison), comparison_model=generation_model,
            synthesis_status=comparison.get('synthesis_status', 'invalid'),
            prompt_tokens=synthesis_usage.get('prompt_tokens'), output_tokens=synthesis_usage.get('output_tokens'),
            total_tokens=synthesis_usage.get('total_tokens'), usage_known=synthesis_usage.get('known'),
            usage_breakdown_json=_to_json(comparison['token_usage'].get('breakdown')),
        ))
        db.commit()
        comparison_full = {**comparison, 'comparison_group_id': group_id, 'question': question, 'created_at': created_at}
        for snapshot in snapshots:
            _atomic_write(Path(settings.execution_dir) / f'execution_{snapshot["execution_id"]}.json', _to_json(snapshot, indent=2))
        _atomic_write(Path(settings.comparison_dir) / f'comparison_{group_id}.json', _to_json(comparison_full, indent=2))
        _atomic_write(Path(settings.comparison_dir) / f'comparison_{group_id}.md', build_markdown(
            group_id=group_id, created_at=created_at, question=question, documents=document_filenames,
            provider=provider, generation_model=generation_model, embedding_model=embedding_model,
            executions=snapshots, analyses={item.get('strategy'): item for item in analyses}, comparison=comparison,
        ))
        return {
            'comparison_group_id': group_id, 'status': group.status, 'version': group.version,
            'question': question, 'documents': document_filenames, 'document_scope': comparison['document_scope'],
            'executions': summary_rows, 'comparison': comparison, 'created_at': created_at,
        }

    @staticmethod
    def list_groups(db: Session) -> list[dict]:
        groups = db.query(ComparisonRun).order_by(ComparisonRun.id.desc()).all()
        out = []
        for group in groups:
            names = [name for (name,) in db.query(RAGExecution.strategy).filter(RAGExecution.comparison_group_id == group.comparison_group_id).all()]
            synthesis = db.query(SemanticComparison.synthesis_status).filter(SemanticComparison.comparison_group_id == group.comparison_group_id).first()
            out.append({
                'comparison_group_id': group.comparison_group_id, 'created_at': group.created_at.isoformat() if group.created_at else None,
                'question': group.question, 'documents': json.loads(group.document_filenames_json or '[]'), 'strategies': names,
                'status': group.status, 'synthesis_status': synthesis[0] if synthesis else None, 'version': group.version,
            })
        return out

    @staticmethod
    def get_group(db: Session, group_id: str) -> dict | None:
        group = db.query(ComparisonRun).filter_by(comparison_group_id=group_id).first()
        if not group:
            return None
        executions = []
        rows = db.query(RAGExecution).filter(RAGExecution.comparison_group_id == group_id).order_by(RAGExecution.id).all()
        for row in rows:
            chunks = [{
                'chunk_id': c.chunk_id, 'document_id': c.document_id, 'filename': c.filename,
                'chunk_index': c.chunk_index, 'text': c.text, 'score': c.score,
                'vector_score': c.vector_score, 'lexical_score': c.lexical_score,
                'metadata': json.loads(c.metadata_json) if c.metadata_json else {},
            } for c in db.query(RetrievedChunk).filter(RetrievedChunk.execution_row_id == row.id).all()]
            analysis_row = db.query(ExecutionAnalysis).filter(ExecutionAnalysis.execution_row_id == row.id).first()
            analysis = json.loads(analysis_row.analysis_json) if analysis_row else None
            executions.append({
                'execution_id': row.execution_id, 'strategy': row.strategy, 'provider': row.provider,
                'generation_model': row.generation_model, 'embedding_model': row.embedding_model, 'top_k': row.top_k,
                'filters': json.loads(row.filters_json) if row.filters_json else {}, 'raw_answer': row.raw_answer,
                'status': row.status, 'error': row.error, 'chunks': chunks, 'analysis': analysis,
            })
        comparison_row = db.query(SemanticComparison).filter(SemanticComparison.comparison_group_id == group_id).first()
        comparison = json.loads(comparison_row.result_json) if comparison_row else None
        if isinstance(comparison, dict):
            comparison = semantic_analyzer.normalize_comparison_result(comparison, [item['analysis'] for item in executions if isinstance(item.get('analysis'), dict)])
        return {
            'comparison_group_id': group_id, 'created_at': group.created_at.isoformat() if group.created_at else None,
            'question': group.question, 'documents': json.loads(group.document_filenames_json or '[]'),
            'status': group.status, 'version': group.version, 'executions': executions, 'comparison': comparison,
        }

    @staticmethod
    def delete_group(db: Session, group_id: str) -> dict:
        group = db.query(ComparisonRun).filter_by(comparison_group_id=group_id).first()
        if not group:
            raise ComparisonGroupNotFoundError(group_id)
        if group.status == STATE_RUNNING:
            raise ComparisonGroupRunningError(group_id)
        executions = db.query(RAGExecution).filter(RAGExecution.comparison_group_id == group_id).all()
        row_ids = [item.id for item in executions]
        execution_ids = [item.execution_id for item in executions]
        if row_ids:
            db.query(RetrievedChunk).filter(RetrievedChunk.execution_row_id.in_(row_ids)).delete(synchronize_session=False)
            db.query(ExecutionAnalysis).filter(ExecutionAnalysis.execution_row_id.in_(row_ids)).delete(synchronize_session=False)
        db.query(RAGExecution).filter(RAGExecution.comparison_group_id == group_id).delete(synchronize_session=False)
        db.query(SemanticComparison).filter(SemanticComparison.comparison_group_id == group_id).delete(synchronize_session=False)
        db.query(ComparisonRun).filter(ComparisonRun.comparison_group_id == group_id).delete(synchronize_session=False)
        db.commit()
        for path in [Path(settings.comparison_dir) / f'comparison_{group_id}.json', Path(settings.comparison_dir) / f'comparison_{group_id}.md'] + [Path(settings.execution_dir) / f'execution_{item}.json' for item in execution_ids]:
            if path.exists():
                path.unlink()
        return {'comparison_group_id': group_id, 'deleted': True}
