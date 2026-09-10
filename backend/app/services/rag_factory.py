from app.rag.strategies import HybridStrategy, VectorStrategy


class RAGFactory:
    _mapping = {
        'vector': VectorStrategy,
        'hybrid': HybridStrategy,
    }

    @classmethod
    def create(cls, name: str):
        try:
            return cls._mapping[name]()
        except KeyError as exc:
            valid = ', '.join(cls._mapping.keys())
            raise ValueError(f'Estrategia RAG invalida: {name}. Use uma de: {valid}.') from exc
