from datetime import datetime

from pydantic import BaseModel


class DocumentResponse(BaseModel):
    id: int
    filename: str
    status: str
    embedding_provider: str | None = None
    embedding_model: str | None = None
    content_type: str | None = None
    chunk_count: int | None = None
    created_at: datetime | None = None


class DocumentDeleteResponse(BaseModel):
    id: int
    filename: str
    deleted: bool
