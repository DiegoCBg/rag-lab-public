from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

_MIGRATIONS = {
    'users': {
        'email': 'ALTER TABLE users ADD COLUMN email VARCHAR',
        'is_admin': 'ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0',
    },
    'documents': {
        'embedding_provider': 'ALTER TABLE documents ADD COLUMN embedding_provider VARCHAR(60)',
        'embedding_model': 'ALTER TABLE documents ADD COLUMN embedding_model VARCHAR(120)',
    },
    'execution_logs': {
        'generation_model': 'ALTER TABLE execution_logs ADD COLUMN generation_model VARCHAR(120)',
        'embedding_model': 'ALTER TABLE execution_logs ADD COLUMN embedding_model VARCHAR(120)',
    },
    'rag_executions': {
        'prompt_tokens': 'ALTER TABLE rag_executions ADD COLUMN prompt_tokens INTEGER',
        'output_tokens': 'ALTER TABLE rag_executions ADD COLUMN output_tokens INTEGER',
        'total_tokens': 'ALTER TABLE rag_executions ADD COLUMN total_tokens INTEGER',
        'prompt_eval_duration_ns': 'ALTER TABLE rag_executions ADD COLUMN prompt_eval_duration_ns INTEGER',
        'eval_duration_ns': 'ALTER TABLE rag_executions ADD COLUMN eval_duration_ns INTEGER',
        'total_duration_ns': 'ALTER TABLE rag_executions ADD COLUMN total_duration_ns INTEGER',
        'usage_known': 'ALTER TABLE rag_executions ADD COLUMN usage_known BOOLEAN',
    },
    'execution_analyses': {
        'prompt_tokens': 'ALTER TABLE execution_analyses ADD COLUMN prompt_tokens INTEGER',
        'output_tokens': 'ALTER TABLE execution_analyses ADD COLUMN output_tokens INTEGER',
        'total_tokens': 'ALTER TABLE execution_analyses ADD COLUMN total_tokens INTEGER',
        'usage_known': 'ALTER TABLE execution_analyses ADD COLUMN usage_known BOOLEAN',
    },
    'semantic_comparisons': {
        'prompt_tokens': 'ALTER TABLE semantic_comparisons ADD COLUMN prompt_tokens INTEGER',
        'output_tokens': 'ALTER TABLE semantic_comparisons ADD COLUMN output_tokens INTEGER',
        'total_tokens': 'ALTER TABLE semantic_comparisons ADD COLUMN total_tokens INTEGER',
        'usage_known': 'ALTER TABLE semantic_comparisons ADD COLUMN usage_known BOOLEAN',
        'usage_breakdown_json': 'ALTER TABLE semantic_comparisons ADD COLUMN usage_breakdown_json TEXT',
    },
}


def run_migrations(engine: Engine):
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    for table, columns in _MIGRATIONS.items():
        if table not in tables:
            continue
        existing = {col['name'] for col in inspector.get_columns(table)}
        with engine.begin() as conn:
            for column, ddl in columns.items():
                if column not in existing:
                    conn.execute(text(ddl))

    if 'users' in tables:
        with engine.begin() as conn:
            has_admin = conn.execute(text('SELECT COUNT(*) FROM users WHERE is_admin = 1')).scalar()
            if not has_admin:
                first = conn.execute(text('SELECT id FROM users ORDER BY id LIMIT 1')).scalar()
                if first:
                    conn.execute(
                        text('UPDATE users SET is_admin = 1 WHERE id = :id'), {'id': first}
                    )
