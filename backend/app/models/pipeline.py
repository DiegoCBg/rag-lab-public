from sqlalchemy import Column, DateTime, Float, Integer, String, Text, func

from app.db.session import Base


class PipelineRun(Base):
    __tablename__ = 'pipeline_runs'

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(String(60), nullable=False, unique=True, index=True)
    mode = Column(String(30), nullable=False)
    status = Column(String(30), nullable=False, default='running')
    active_stage = Column(String(60), nullable=True)
    question = Column(Text, nullable=False)
    provider = Column(String(60), nullable=False)
    strategies_json = Column(Text, nullable=False)
    config_json = Column(Text, nullable=True)
    synthesis_json = Column(Text, nullable=True)
    errors_json = Column(Text, nullable=False, default='[]')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PipelineRunResult(Base):
    __tablename__ = 'pipeline_run_results'

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(String(60), nullable=False, index=True)
    execution_id = Column(String(60), nullable=True, index=True)
    strategy = Column(String(60), nullable=False, index=True)
    result_json = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PipelineEvent(Base):
    __tablename__ = 'pipeline_events'

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(String(60), nullable=False, unique=True, index=True)
    run_id = Column(String(60), nullable=False, index=True)
    stage = Column(String(60), nullable=False)
    status = Column(String(30), nullable=False)
    sequence = Column(Integer, nullable=False)
    label = Column(Text, nullable=False)
    strategy = Column(String(60), nullable=True)
    duration_ms = Column(Float, nullable=True)
    error_code = Column(String(120), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
