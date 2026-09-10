from pydantic import BaseModel, Field, field_validator

from app.rag.registry import STRATEGY_IDS
from app.schemas.document_scope import DocumentScopeRequest


class ComparisonRunRequest(DocumentScopeRequest):
    question: str
    strategies: list[str] | None = None
    provider: str = 'ollama'
    locale: str = 'pt-BR'
    content_type_filter: str | None = None
    status_filter: str | None = None
    top_k: int = Field(default=10, ge=1, le=50)

    @field_validator('strategies')
    @classmethod
    def validate_strategies(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        invalid = [strategy for strategy in value if strategy not in STRATEGY_IDS]
        if invalid:
            valid = ', '.join(STRATEGY_IDS)
            raise ValueError(f'Estrategias RAG invalidas: {", ".join(invalid)}. Use: {valid}.')
        return value
