import hashlib

import chromadb

from app.core.config import settings


class VectorStoreUnavailable(RuntimeError):
    """Raised when the external Chroma service cannot be reached."""

class ChromaService:
    _client = None
    _collections = {}

    @classmethod
    def client(cls):
        if cls._client is None:
            try:
                cls._client = chromadb.HttpClient(
                    host=settings.chroma_host,
                    port=settings.chroma_port,
                )
            except Exception as exc:
                cls._client = None
                raise VectorStoreUnavailable('Chroma indisponível. Inicie o serviço vetorial e tente novamente.') from exc
        return cls._client

    @classmethod
    def reset_client(cls):
        cls._client = None
        cls._collections = {}

    @classmethod
    def heartbeat(cls) -> bool:
        try:
            cls.client().heartbeat()
            return True
        except Exception as exc:
            cls.reset_client()
            raise VectorStoreUnavailable('Chroma indisponível. Consultas vetoriais estão temporariamente bloqueadas.') from exc

    @classmethod
    def _collection_name(cls, provider: str | None = None, model: str | None = None) -> str:
        if provider is None or model is None:
            from app.services.runtime_settings import get_active_provider, get_provider_embedding_model

            provider = provider or get_active_provider()
            model = model or get_provider_embedding_model(provider)
        provider = str(provider or 'ollama').strip().lower()
        model = str(model or 'nomic-embed-text').strip()
        # Mantem a colecao historica do Ollama para nao invalidar o acervo
        # existente. Outros pares usam espacos vetoriais isolados.
        if provider == 'ollama' and model == 'nomic-embed-text':
            return 'rag_lab_chunks'
        digest = hashlib.sha1(f'{provider}:{model}'.encode('utf-8')).hexdigest()[:16]
        return f'rag_lab_chunks_{digest}'

    @classmethod
    def collection(cls, provider: str | None = None, model: str | None = None):
        name = cls._collection_name(provider, model)
        if name in cls._collections:
            cls.heartbeat()
            return cls._collections[name]
        client = cls.client()
        if client is None:
            raise VectorStoreUnavailable('Chroma indisponível. Inicie o serviço vetorial e tente novamente.')
        try:
            collection = client.get_or_create_collection(name)
            cls._collections[name] = collection
        except Exception as exc:
            cls._collections.pop(name, None)
            cls.reset_client()
            raise VectorStoreUnavailable('Chroma indisponível. Inicie o serviço vetorial e tente novamente.') from exc
        return collection

    @classmethod
    def existing_collection(cls, provider: str | None = None, model: str | None = None):
        name = cls._collection_name(provider, model)
        client = cls.client()
        try:
            return client.get_collection(name)
        except Exception as exc:
            message = str(exc).lower()
            if 'does not exist' in message or 'not found' in message:
                return None
            cls.reset_client()
            raise VectorStoreUnavailable('Chroma indisponível. Inicie o serviço vetorial e tente novamente.') from exc

    @classmethod
    def safe_count(cls):
        """Return the vector count without creating a collection during status checks."""
        try:
            cls.heartbeat()
            collection = cls.existing_collection()
            if collection is None:
                return 0
            return collection.count()
        except VectorStoreUnavailable:
            raise
        except Exception as exc:
            cls.reset_client()
            raise VectorStoreUnavailable('Chroma indisponível. Inicie o serviço vetorial e tente novamente.') from exc

    @classmethod
    def safe_count_or_zero(cls) -> int:
        try:
            return cls.safe_count()
        except VectorStoreUnavailable:
            return 0
