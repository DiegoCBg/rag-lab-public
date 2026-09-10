import json
from sqlalchemy.orm import Session
from app.models.execution import ExecutionLog

class ExecutionService:
    @staticmethod
    def log(
        db: Session,
        question: str,
        strategy: str,
        provider: str,
        answer_preview: str,
        sources: list[str],
        generation_model: str | None = None,
        embedding_model: str | None = None,
    ):
        item = ExecutionLog(
            question=question,
            strategy=strategy,
            provider=provider,
            generation_model=generation_model,
            embedding_model=embedding_model,
            answer_preview=answer_preview[:240],
            sources_json=json.dumps(sources, ensure_ascii=False),
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    @staticmethod
    def list_recent(db: Session, limit: int = 20):
        items = db.query(ExecutionLog).order_by(ExecutionLog.id.desc()).limit(limit).all()
        return [ExecutionService.serialize(item) for item in items]

    @staticmethod
    def serialize(item: ExecutionLog) -> dict:
        sources = []
        if item.sources_json:
            try:
                parsed = json.loads(item.sources_json)
                sources = parsed if isinstance(parsed, list) else []
            except json.JSONDecodeError:
                sources = []
        return {
            'id': item.id,
            'question': item.question,
            'strategy': item.strategy,
            'provider': item.provider,
            'generation_model': item.generation_model,
            'embedding_model': item.embedding_model,
            'answer_preview': item.answer_preview,
            'sources': sources,
            'created_at': item.created_at,
        }
