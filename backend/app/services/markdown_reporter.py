"""Relatório Markdown legível da comparação semântica RAG.

Documento de demonstração destinado a ser compreendido sem abrir o banco
nem ler JSON: resposta integral de cada estratégia, interpretação,
evidências, núcleo comum, informações complementares, contradições e
síntese combinada.
"""


def _line(value):
    return str(value if value is not None else '')


_iso = _line


def _claims_block(analysis: dict) -> str:
    lines = []
    for claim in analysis.get('claims', []) or []:
        status = 'sustentada' if claim.get('grounded') else 'sem evidência'
        lines.append(
            f"- **{claim.get('claim_id', '')}** ({claim.get('type', '')}, {status}): "
            f"{_line(claim.get('text'))}"
        )
        chunks = claim.get('supporting_chunk_ids') or []
        evidence_ids = claim.get('evidence_ids') or []
        if evidence_ids:
            lines.append(f"    - evidence_id: {', '.join(map(str, evidence_ids))}")
        if chunks:
            lines.append(f"    - Evidências: {', '.join(map(str, chunks))}")
    return '\n'.join(lines) if lines else '- nenhuma afirmação registrada'


def _evidence_block(chunks: list[dict]) -> str:
    lines = []
    for chunk in chunks:
        name = chunk.get('filename') or ''
        cid = chunk.get('chunk_id') or ''
        text = (chunk.get('text') or '')[:300]
        lines.append(f"- [{name} | {cid}] {text}")
    return '\n'.join(lines) if lines else '- nenhum trecho recuperado'


def _unsupported_block(analysis: dict) -> list[str]:
    unsupported = analysis.get('unsupported_claims') or []
    return [f'- {_line(claim)}' for claim in unsupported]


def _usage_line(usage: dict | None, label: str) -> str:
    if not isinstance(usage, dict) or not usage.get('known'):
        return f'- {label}: não informado'
    return f"- {label}: {usage.get('total_tokens', 'não informado')} tokens ({usage.get('calls', 0)} chamada(s))"


def build_markdown(
    group_id: str,
    created_at: str,
    question: str,
    documents: list[str],
    provider: str,
    generation_model: str,
    embedding_model: str,
    executions: list[dict],
    analyses: dict,
    comparison: dict,
) -> str:
    lines = []
    lines.append('# Comparação Semântica RAG')
    lines.append('')
    lines.append('## Identificação')
    lines.append(f'- comparison_group_id: `{group_id}`')
    lines.append(f'- data e hora: {_iso(created_at)}')
    lines.append(f'- pergunta: {_iso(question)}')
    lines.append(f'- documentos analisados: {", ".join(documents) if documents else "-"}')
    lines.append(f'- provider: {_iso(provider)}')
    lines.append(
        f'- modelos: geração={_iso(generation_model)}; embeddings={_iso(embedding_model)}'
    )
    lines.append('')

    for execution in executions:
        strategy = execution.get('strategy', '?')
        status = execution.get('status', '?')
        lines.append(f'## Resultado do {strategy}')
        if status != 'ok':
            lines.append(f'- status: {_iso(status)}; erro: {_iso(execution.get("error"))}')
        lines.append(f'- resposta integral: {_iso(execution.get("raw_answer"))}')
        analysis = analyses.get(strategy) or {}
        if analysis:
            lines.append(f'- tema identificado: {_iso(analysis.get("main_topic"))}')
            lines.append('- afirmações:')
            lines.append(_claims_block(analysis))
        lines.append('- evidências:')
        lines.append(_evidence_block(execution.get('chunks', [])))
        lines.append('')

    lines.append('## Núcleo comum')
    consensus = comparison.get('consensus_claims') or []
    for claim in consensus:
        lines.append(f'- {_line(claim)}')
    if not consensus:
        lines.append('- Nenhuma informação comum consolidada')
    lines.append('')

    lines.append('## Informações complementares')
    unique = comparison.get('unique_claims_by_strategy') or {}
    if unique:
        for strategy, items in unique.items():
            for item in items:
                lines.append(f'- [{strategy}] {_line(item)}')
    else:
        lines.append('- Nenhuma informação exclusiva sustentada identificada')
    lines.append('')

    lines.append('## Contradições')
    contradictions = comparison.get('contradictions') or []
    for contradiction in contradictions:
        lines.append(f'- {_line(contradiction)}')
    if not contradictions:
        lines.append('- Nenhuma contradição detectada')
    lines.append('')

    lines.append('## Afirmações sem evidência')
    unsupported = []
    for analysis in analyses.values():
        unsupported.extend(_unsupported_block(analysis))
    unsupported.extend(comparison.get('unsupported_claims') or [])
    for item in unsupported:
        lines.append(f'- {_line(item)}')
    if not unsupported:
        lines.append('- Nenhuma afirmação sem evidência registrada')
    lines.append('')

    lines.append('## Validade da junção')
    lines.append(f"- status: {_iso(comparison.get('synthesis_status'))}")
    lines.append(f"- justificativa: {_iso(comparison.get('synthesis_reason'))}")
    lines.append('')

    usage = comparison.get('token_usage') or {}
    breakdown = usage.get('breakdown') or {}
    lines.append('## Uso de tokens')
    lines.append(_usage_line(breakdown.get('generation'), 'Geração'))
    lines.append(_usage_line(breakdown.get('audit'), 'Auditoria'))
    lines.append(_usage_line(breakdown.get('synthesis'), 'Síntese'))
    lines.append(_usage_line(usage, 'Total'))
    lines.append(f"- Chamadas: {usage.get('calls', 'não informado') if isinstance(usage, dict) else 'não informado'}")
    lines.append('')

    lines.append('## Síntese combinada')
    synthesis = comparison.get('combined_synthesis')
    lines.append(_iso(synthesis) if synthesis else '- Indisponível')
    lines.append('')

    return '\n'.join(lines)
