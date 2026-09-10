from sqlalchemy import Column, DateTime, Integer, String, Text, func
from app.db.session import Base

class Document(Base):
    __tablename__ = 'documents'

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    content_type = Column(String, nullable=True)
    path = Column(String, nullable=False)
    status = Column(String, nullable=False, default='uploaded')
    embedding_provider = Column(String(60), nullable=True)
    embedding_model = Column(String(120), nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
