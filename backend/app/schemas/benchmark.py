from pydantic import BaseModel

class BenchmarkQuestion(BaseModel):
    question: str
    expected_keywords: list[str] = []

class BenchmarkRequest(BaseModel):
    items: list[BenchmarkQuestion]
    strategy: str
    provider: str
    locale: str = 'pt-BR'
    content_type_filter: str | None = None
    status_filter: str | None = None

class BenchmarkCompareRequest(BaseModel):
    items: list[BenchmarkQuestion]
    primary_strategy: str
    secondary_strategy: str
    provider: str
    locale: str = 'pt-BR'
    content_type_filter: str | None = None
    status_filter: str | None = None

class BenchmarkResultItem(BaseModel):
    question: str
    answer_preview: str
    sources: list[str]
    keyword_hits: int
    keyword_total: int
    score_ratio: float | None
    evaluated: bool

class BenchmarkResponse(BaseModel):
    strategy: str
    provider: str
    generation_model: str | None = None
    embedding_model: str | None = None
    average_keyword_score: float | None
    evaluated_items: int
    total_items: int
    warning: str | None = None
    items: list[BenchmarkResultItem]

class BenchmarkCompareRow(BaseModel):
    question: str
    primary_score: float | None
    secondary_score: float | None
    evaluated: bool
    winner: str

class BenchmarkCompareResponse(BaseModel):
    provider: str
    generation_model: str | None = None
    embedding_model: str | None = None
    primary_strategy: str
    secondary_strategy: str
    primary_average: float | None
    secondary_average: float | None
    evaluated_items: int
    total_items: int
    warning: str | None = None
    winner: str
    rows: list[BenchmarkCompareRow]
