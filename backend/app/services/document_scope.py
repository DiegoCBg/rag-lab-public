"""Resolve and recheck the indexed document scope used by retrieval."""

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
import logging

from fastapi import HTTPException

from app.models.document import Document
from app.schemas.document_scope import DocumentScopeRequest
from app.services.runtime_settings import get_provider_embedding_model

logger = logging.getLogger(__name__)
active_scope = ContextVar('document_scope', default=None)


@dataclass(frozen=True)
class ResolvedDocumentScope:
    mode: str
    requested_ids: tuple[str, ...]
    ids: tuple[str, ...]
    filenames: tuple[str, ...]
    provider: str
    embedding_model: str
    content_type: str | None
    status: str | None

    def public(self, used=()):
        used_ids = set(used)
        return {
            'mode': self.mode,
            'requested_document_ids': list(self.requested_ids),
            'resolved_document_ids': list(self.ids),
            'resolved_document_filenames': list(self.filenames),
            'used_document_ids': [item for item in self.ids if item in used_ids],
        }

    @property
    def filters(self):
        return {'document_id': {'$in': list(self.ids)}}


def _invalid(issues, *, changed=False):
    raise HTTPException(status_code=409 if changed else 422, detail={
        'code': 'document_scope_changed' if changed else 'document_selection_invalid',
        'message': 'Documentos da investigação ficaram indisponíveis.' if changed else 'Revise os documentos selecionados.',
        'issues': issues,
    })


def _issues(docs, ids, provider, embedding_model, content_type, status):
    by_id = {str(doc.id): doc for doc in docs}
    issues = []
    for document_id in ids:
        doc = by_id.get(document_id)
        reason = None
        if doc is None:
            reason = 'not_found'
        elif doc.status != 'indexed':
            reason = 'not_indexed'
        elif (content_type and doc.content_type != content_type) or (status and doc.status != status):
            reason = 'filter_mismatch'
        elif doc.embedding_provider != provider or doc.embedding_model != embedding_model:
            reason = 'embedding_incompatible'
        if reason:
            issues.append({'document_id': document_id, 'reason': reason})
    return issues


def resolve_documents(db, *, provider, strategies, document_scope='all', document_ids=None,
                      content_type_filter=None, status_filter=None):
    request = DocumentScopeRequest(document_scope=document_scope, document_ids=document_ids)
    query = db.query(Document)
    if request.document_scope == 'selected':
        query = query.filter(Document.id.in_([int(value) for value in request.document_ids]))
    else:
        query = query.filter(Document.status == 'indexed')
        if content_type_filter:
            query = query.filter(Document.content_type == content_type_filter)
        if status_filter:
            query = query.filter(Document.status == status_filter)
    docs = query.order_by(Document.id).all()
    ids = request.document_ids if request.document_scope == 'selected' else [str(doc.id) for doc in docs]
    model = get_provider_embedding_model(provider)
    issues = _issues(docs, ids, provider, model, content_type_filter, status_filter)
    if issues or not ids:
        _invalid(issues)
    by_id = {str(doc.id): doc for doc in docs}
    return ResolvedDocumentScope(
        request.document_scope, tuple(request.document_ids), tuple(ids),
        tuple(by_id[value].filename for value in ids),
        provider, model, content_type_filter, status_filter,
    )


def check_available(db, scope):
    docs = db.query(Document).populate_existing().filter(Document.id.in_([int(value) for value in scope.ids])).all()
    issues = _issues(docs, scope.ids, scope.provider, scope.embedding_model,
                     scope.content_type, scope.status)
    if issues:
        _invalid(issues, changed=True)


@contextmanager
def retrieval_scope(scope):
    token = active_scope.set(scope)
    try:
        yield
    finally:
        active_scope.reset(token)


def validate_evidence_scope(items, scope):
    used = set()
    for item in items:
        document_id = str(item.get('document_id') or (item.get('metadata') or {}).get('document_id') or '')
        if document_id not in scope.ids:
            logger.error('document_scope_violation document_id=%s', document_id)
            raise HTTPException(status_code=409, detail={
                'code': 'document_scope_violation',
                'message': 'Evidência fora dos documentos autorizados. A geração foi interrompida.',
            })
        used.add(document_id)
    return used
