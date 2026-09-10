from pydantic import BaseModel, Field, field_validator

from app.rag.registry import STRATEGY_IDS
from app.schemas.document_scope import DocumentScopeRequest


class RAGQueryRequest(DocumentScopeRequest):
    question: str
    strategy: str = ''
    provider: str = ''
    locale: str = 'pt-BR'
    top_k: int = Field(default=10, ge=1, le=50)
    content_type_filter: str | None = None
    status_filter: str | None = None

    @field_validator('strategy')
    @classmethod
    def validate_strategy(cls, value: str) -> str:
        if value in (None, ''):
            return ''
        if value not in STRATEGY_IDS:
            valid = ', '.join(STRATEGY_IDS)
            raise ValueError(f'Estrategia RAG invalida: {value}. Use uma de: {valid}.')
        return value


class RAGQueryResponse(BaseModel):
    document_scope: dict | None = None
    execution_id: str | None = None
    answer: str
    strategy: str
    provider: str
    generation_model: str | None = None
    embedding_model: str | None = None
    sources: list[str]
    chunks: list[dict]
    metrics: dict
    evidence_ledger: list[dict] = []
    claims: list[dict] = []
    unsupported_claims: list[dict] = []
    limitations: list[str] = []
    answer_grounding_status: str | None = None
    retrieval_state: str | None = None
    fallback_reason: str | None = None


class RAGRunRequest(DocumentScopeRequest):
    mode: str = Field(default='single', pattern='^(single|comparison)$')
    question: str
    strategies: list[str]
    provider: str = ''
    locale: str = 'pt-BR'
    top_k: int = Field(default=10, ge=1, le=50)
    content_type_filter: str | None = None
    status_filter: str | None = None

    @field_validator('strategies')
    @classmethod
    def validate_strategies(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError('Informe pelo menos uma estrategia.')
        if len(value) > len(STRATEGY_IDS):
            raise ValueError(f'Informe no maximo {len(STRATEGY_IDS)} estrategias.')
        duplicates = sorted({item for item in value if value.count(item) > 1})
        if duplicates:
            raise ValueError(f'Estrategias duplicadas: {", ".join(duplicates)}.')
        invalid = [item for item in value if item not in STRATEGY_IDS]
        if invalid:
            valid = ', '.join(STRATEGY_IDS)
            raise ValueError(f'Estrategia RAG invalida: {", ".join(invalid)}. Use uma de: {valid}.')
        return value


class RAGRunEvent(BaseModel):
    id: str
    stage: str
    status: str
    sequence: int
    label: str
    strategy: str | None = None
    durationMs: float | None = None
    errorCode: str | None = None


class RAGRunResponse(BaseModel):
    document_scope: dict | None = None
    run_id: str
    mode: str
    status: str
    active_stage: str | None = None
    question: str
    provider: str
    generation_model: str | None = None
    embedding_model: str | None = None
    locale: str = 'pt-BR'
    strategies: list[str]
    results: list[RAGQueryResponse] = []
    synthesis: dict | None = None
    events: list[RAGRunEvent] = []
    errors: list[dict] = []
