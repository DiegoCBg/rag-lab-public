from sqlalchemy import Column, DateTime, Integer, String, Text, func
from app.db.session import Base

class ExperimentLog(Base):
    __tablename__ = 'experiment_logs'

    id = Column(Integer, primary_key=True, index=True)
    question = Column(Text, nullable=False)
    primary_strategy = Column(String, nullable=False)
    secondary_strategy = Column(String, nullable=True)
    provider = Column(String, nullable=False)
    summary_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
