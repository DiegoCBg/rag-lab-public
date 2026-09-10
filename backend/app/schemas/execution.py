from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ExecutionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    question: str
    strategy: str
    provider: str
    generation_model: str | None = None
    answer_preview: str | None = None
    sources: list[str] = []
    created_at: datetime | None = None
