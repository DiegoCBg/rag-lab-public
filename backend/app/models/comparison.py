"""Modelos do laboratório de comparação semântica RAG.

SQLite é a fonte canônica: cada grupo agrupa todas as execuções da mesma
pergunta sobre o mesmo conjunto de documentos. Cada execução guarda a
resposta bruta (imutável), o contexto recuperado (chunks) e a análise
estruturada separada. A comparação semântica liga todas as execuções.
"""

import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, func
from app.db.session import Base


class ComparisonRun(Base):
    __tablename__ = 'comparison_runs'

    id = Column(Integer, primary_key=True, index=True)
    comparison_group_id = Column(String(60), nullable=False, unique=True, index=True)
    question = Column(Text, nullable=False)
    document_ids_json = Column(Text, nullable=True)
    document_filenames_json = Column(Text, nullable=True)
    status = Column(String(30), nullable=False, default='running')
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class RAGExecution(Base):
    __tablename__ = 'rag_executions'

    id = Column(Integer, primary_key=True, index=True)
    execution_id = Column(String(60), nullable=False, unique=True, index=True)
    comparison_group_id = Column(String(60), nullable=False, index=True)
    question = Column(Text, nullable=False)
    document_ids_json = Column(Text, nullable=True)
    document_filenames_json = Column(Text, nullable=True)
    strategy = Column(String(60), nullable=False)
    provider = Column(String(60), nullable=False)
    generation_model = Column(String(120), nullable=True)
    embedding_model = Column(String(120), nullable=True)
    filters_json = Column(Text, nullable=True)
    top_k = Column(Integer, nullable=False, default=10)
    raw_answer = Column(Text, nullable=True)
    status = Column(String(30), nullable=False, default='running')
    error = Column(Text, nullable=True)
    prompt_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    total_tokens = Column(Integer, nullable=True)
    prompt_eval_duration_ns = Column(Integer, nullable=True)
    eval_duration_ns = Column(Integer, nullable=True)
    total_duration_ns = Column(Integer, nullable=True)
    usage_known = Column(Boolean, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class RetrievedChunk(Base):
    __tablename__ = 'retrieved_chunks'

    id = Column(Integer, primary_key=True, index=True)
    execution_row_id = Column(Integer, nullable=False, index=True)
    chunk_id = Column(String, nullable=True)
    document_id = Column(String, nullable=True)
    filename = Column(String, nullable=True)
    chunk_index = Column(Integer, nullable=True)
    text = Column(Text, nullable=True)
    score = Column(Text, nullable=True)
    vector_score = Column(Text, nullable=True)
    lexical_score = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)


class ExecutionAnalysis(Base):
    __tablename__ = 'execution_analyses'

    id = Column(Integer, primary_key=True, index=True)
    execution_row_id = Column(Integer, nullable=False, index=True)
    analysis_json = Column(Text, nullable=False)
    prompt_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    total_tokens = Column(Integer, nullable=True)
    usage_known = Column(Boolean, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SemanticComparison(Base):
    __tablename__ = 'semantic_comparisons'

    id = Column(Integer, primary_key=True, index=True)
    comparison_group_id = Column(String(60), nullable=False, unique=True, index=True)
    execution_ids_json = Column(Text, nullable=False)
    question = Column(Text, nullable=False)
    result_json = Column(Text, nullable=False)
    comparison_model = Column(String(120), nullable=True)
    synthesis_status = Column(String(30), nullable=False)
    prompt_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    total_tokens = Column(Integer, nullable=True)
    usage_known = Column(Boolean, nullable=True)
    usage_breakdown_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
