from datetime import datetime

from pydantic import BaseModel, ConfigDict

class ExperimentCreateRequest(BaseModel):
    question: str
    primary_strategy: str
    secondary_strategy: str | None = None
    provider: str
    summary_json: str | None = None

class ExperimentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    question: str
    primary_strategy: str
    secondary_strategy: str | None = None
    provider: str
    summary_json: str | None = None
    created_at: datetime | None = None
