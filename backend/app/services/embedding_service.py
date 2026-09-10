import httpx
from app.services.runtime_settings import get_ollama_base_url
from app.services import runtime_settings
from app.services.provider_factory import ProviderFactory

class EmbeddingService:
    @staticmethod
    async def ollama_embedding(texts: list[str], model: str | None = None, batch_size: int = 25) -> list[list[float]]:
        """Gera embeddings em lotes via /api/embed (que aceita múltiplos inputs).

        O endpoint antigo /api/embeddings só aceita um texto por request —
        para arquivos grandes (dezenas de milhares de chunks) isso tornava a
        indexação impraticavelmente lenta. Batch reduz request overhead.
        """
        if not texts:
            return []

        model = model or runtime_settings.get_provider_embedding_model('ollama')

        results: list[list[float]] = []
        async with httpx.AsyncClient(timeout=600) as client:
            for i in range(0, len(texts), batch_size):
                batch = texts[i:i + batch_size]
                response = await client.post(
                    f"{get_ollama_base_url()}/api/embed",
                    json={'model': model, 'input': batch},
                )
                response.raise_for_status()
                data = response.json()
                embeddings = data.get('embeddings')
                if not embeddings or len(embeddings) != len(batch):
                    raise RuntimeError(
                        f'Ollama retornou {len(embeddings) if embeddings else 0} '
                        f'embeddings para {len(batch)} textos.'
                    )
                results.extend(embeddings)
        return results

    @staticmethod
    async def embed(texts: list[str], provider: str | None = None, batch_size: int = 25) -> list[list[float]]:
        """Gera embeddings no mesmo provedor configurado para o fluxo RAG."""
        if not texts:
            return []
        # O argumento existe por compatibilidade com as estrategias, mas a
        # escolha real vem sempre do servidor global configurado.
        active_provider = runtime_settings.get_active_provider().strip().lower()
        if active_provider == 'ollama':
            # Mantém o ponto de substituição usado pelos testes e pelo modo local.
            return await EmbeddingService.ollama_embedding(texts)

        provider_client = ProviderFactory.create(active_provider, require_embeddings=True)
        results: list[list[float]] = []
        for start in range(0, len(texts), batch_size):
            results.extend(await provider_client.embed(texts[start:start + batch_size]))
        return results
