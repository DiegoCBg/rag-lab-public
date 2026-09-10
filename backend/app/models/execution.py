from sqlalchemy import Column, DateTime, Integer, String, Text, func
from app.db.session import Base

class ExecutionLog(Base):
    __tablename__ = 'execution_logs'

    id = Column(Integer, primary_key=True, index=True)
    question = Column(Text, nullable=False)
    strategy = Column(String, nullable=False)
    provider = Column(String, nullable=False)
    generation_model = Column(String(120), nullable=True)
    embedding_model = Column(String(120), nullable=True)
    answer_preview = Column(Text, nullable=True)
    sources_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
