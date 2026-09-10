from sqlalchemy.orm import Session
from app.models.experiment import ExperimentLog
from app.schemas.experiment import ExperimentCreateRequest
from app.services.runtime_settings import get_active_provider

class ExperimentService:
    @staticmethod
    def create(db: Session, payload: ExperimentCreateRequest):
        item = ExperimentLog(
            question=payload.question,
            primary_strategy=payload.primary_strategy,
            secondary_strategy=payload.secondary_strategy,
            provider=get_active_provider(),
            summary_json=payload.summary_json,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    @staticmethod
    def list_recent(db: Session, limit: int = 20):
        return db.query(ExperimentLog).order_by(ExperimentLog.id.desc()).limit(limit).all()
