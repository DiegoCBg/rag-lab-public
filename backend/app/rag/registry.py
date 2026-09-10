STRATEGY_LABELS = {
    'vector': 'Vector RAG',
    'hybrid': 'Hybrid RAG',
}

STRATEGY_IDS = list(STRATEGY_LABELS.keys())


def strategy_options() -> list[dict]:
    return [{'id': strategy_id, 'label': label} for strategy_id, label in STRATEGY_LABELS.items()]
