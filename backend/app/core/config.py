from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    app_name: str = 'RAG Lab Protótipo'
    app_env: str = 'development'
    app_host: str = '127.0.0.1'
    app_port: int = 8000
    secret_key: str = 'change-me-in-production'
    jwt_expire_minutes: int = 1440
    database_url: str = 'sqlite:///./raglab_public.db'
    upload_dir: str = './storage/uploads'
    index_dir: str = './storage/indexes'
    chroma_host: str = '127.0.0.1'
    chroma_port: int = 8001
    chroma_timeout_seconds: float = 5.0
    execution_dir: str = './storage/executions'
    comparison_dir: str = './storage/comparisons'
    ollama_base_url: str = 'http://localhost:11434'
    ollama_model: str = 'llama3.1'
    ollama_embedding_model: str = 'nomic-embed-text'
    ollama_context_tokens: int = 131_072
    ollama_generate_timeout_seconds: float = 600.0
    cors_origins: str = 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173'
    openai_api_key: str = ''
    openai_model: str = 'gpt-5-mini'
    openai_embedding_model: str = 'text-embedding-3-small'
    anthropic_api_key: str = ''
    anthropic_model: str = 'claude-sonnet-4-20250514'
    google_api_key: str = ''
    google_model: str = 'gemini-3.5-flash'
    google_embedding_model: str = 'gemini-embedding-001'
    deepseek_api_key: str = ''
    deepseek_model: str = 'deepseek-v4-flash'
    default_chat_provider: str = 'ollama'
    default_rag_strategy: str = 'hybrid'

settings = Settings()
