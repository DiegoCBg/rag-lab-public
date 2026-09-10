type LooseRecord = Record<string, unknown>

const STRATEGY_LABELS: Record<string, string> = {
  vector: 'Vector',
  hybrid: 'Hybrid',
}

const HUMAN_STRATEGY_LABELS: Record<string, string> = {
  vector: 'RAG Vetorial',
  hybrid: 'RAG Híbrido',
}

const COMPACT_STRATEGY_LABELS: Record<string, string> = {
  vector: 'Vetorial',
  hybrid: 'Híbrido',
}

const CLAIM_TYPE_LABELS: Record<string, string> = {
  fact: 'Fato',
  fato: 'Fato',
  hecho: 'Fato',
  interpretation: 'Interpretação',
  interpretacao: 'Interpretação',
  interpretacion: 'Interpretação',
  conclusion: 'Conclusão',
  conclusao: 'Conclusão',
  recommendation: 'Recomendação',
  recomendacao: 'Recomendação',
  recomendacion: 'Recomendação',
  opinion: 'Opinião',
  inference: 'Inferência',
  inferencia: 'Inferência',
  general: 'Geral',
  geral: 'Geral',
}

const DISPLAY_STATUS_LABELS: Record<string, string> = {
  supported_consensus: 'Consenso',
  supported_equivalent: 'Afirmação equivalente',
  supported_exclusive: 'Afirmação exclusiva sustentada',
  supported_complementary: 'Informação complementar',
  review_required: 'Revisão necessária',
  unsupported: 'Sem evidência',
  contradiction: 'Contradição real',
}

const asRecord = (value: unknown): LooseRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as LooseRecord
}

const asExecutions = (value: unknown): LooseRecord[] => {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is LooseRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
}

export function strategyLabel(id: unknown): string {
  const normalized = typeof id === 'string' ? id : ''
  return STRATEGY_LABELS[normalized] || normalized || 'Estratégia'
}

export function strategyHumanLabel(id: unknown): string {
  const normalized = typeof id === 'string' ? id : ''
  const aliases: Record<string, string> = {
    Vector: HUMAN_STRATEGY_LABELS.vector,
    Hybrid: HUMAN_STRATEGY_LABELS.hybrid,
  }
  return HUMAN_STRATEGY_LABELS[normalized] || aliases[normalized] || normalized || 'Estratégia'
}

export function strategyCompactLabel(id: unknown): string {
  const normalized = typeof id === 'string' ? id : ''
  const aliases: Record<string, string> = {
    Vector: COMPACT_STRATEGY_LABELS.vector,
    Hybrid: COMPACT_STRATEGY_LABELS.hybrid,
  }
  return COMPACT_STRATEGY_LABELS[normalized] || aliases[normalized] || strategyHumanLabel(id)
}

export function claimTypeLabel(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'Geral'
  const normalized = value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return CLAIM_TYPE_LABELS[normalized] || value.trim()
}

export function claimDisplayStatusLabel(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'Afirmação'
  return DISPLAY_STATUS_LABELS[value.trim()] || value.trim()
}

export function documentsFromExecutions(executions: readonly LooseRecord[] = []): string[] {
  const found: string[] = []
  for (const execution of executions) {
    const chunks = Array.isArray(execution.chunks) ? execution.chunks : []
    for (const chunk of chunks) {
      const name = asRecord(chunk).filename
      if (typeof name === 'string' && name && !found.includes(name)) {
        found.push(name)
      }
    }
  }
  return found
}

export function isDocumentMixed(executions: readonly LooseRecord[] = []): boolean {
  return documentsFromExecutions(executions).length > 1
}

export function juncaoDecision(group: LooseRecord = {}) {
  const comparison = asRecord(group.comparison)
  const executions = asExecutions(group.executions)
  const rawStatus = typeof comparison.synthesis_status === 'string' ? comparison.synthesis_status : 'invalid'
  const mixed = isDocumentMixed(executions)
  const hasSynthesis = typeof comparison.combined_synthesis === 'string' && comparison.combined_synthesis.trim().length > 0
  const level: 'valid' | 'partial' | 'invalid' = rawStatus === 'valid' && mixed
    ? 'partial'
    : rawStatus === 'valid'
      ? 'valid'
      : rawStatus === 'partial' || (rawStatus === 'invalid' && hasSynthesis)
        ? 'partial'
        : 'invalid'
  const relation: Record<'valid' | 'partial' | 'invalid', string> = {
    valid: 'Junção válida',
    partial: 'Junção parcialmente válida',
    invalid: 'Junção inválida',
  }
  const docCount = documentsFromExecutions(executions).length
  const mixedNote =
    `Atenção: as estratégias recuperaram conteúdos de ${docCount} documentos diferentes. ` +
    'A síntese entre esses assuntos é apenas parcialmente válida.'
  const reason = typeof comparison.synthesis_reason === 'string' ? comparison.synthesis_reason : ''
  const message = mixed && rawStatus === 'valid' ? mixedNote : reason || mixedNote
  return { level, label: relation[level], message, mixed }
}

export function analysesByStrategy(group: LooseRecord = {}) {
  const entries: Array<{ strategy: unknown; analysis: unknown }> = []
  for (const execution of asExecutions(group.executions)) {
    if (execution.status === 'ok' && execution.analysis) {
      entries.push({ strategy: execution.strategy, analysis: execution.analysis })
    }
  }
  return entries
}

export function displayClaimItems(items: unknown) {
  if (!Array.isArray(items)) return []
  return items.map((item) => {
    if (typeof item === 'string') {
      return {
        text: item,
        display_status: '',
        display_label: claimDisplayStatusLabel(''),
        classification_reason: '',
        strategies: [] as string[],
      }
    }
    const record = asRecord(item)
    const text = typeof record.text === 'string' ? record.text : String(item)
    const status = typeof record.display_status === 'string' ? record.display_status : ''
    const reason = typeof record.classification_reason === 'string'
      ? record.classification_reason
      : typeof record.reason === 'string'
        ? record.reason
        : ''
    const strategies = Array.isArray(record.strategies)
      ? record.strategies.filter((value): value is string => typeof value === 'string')
      : []
    return {
      text,
      display_status: status,
      display_label: claimDisplayStatusLabel(status),
      classification_reason: reason,
      strategies,
      confidence: typeof record.confidence === 'number' ? record.confidence : null,
      evidence_ids: Array.isArray(record.evidence_ids) ? record.evidence_ids : [],
    }
  })
}

export function exclusiveClaimsByStrategy(comparison: LooseRecord = {}) {
  const entries: Array<{ label: string; strategy: string; items: ReturnType<typeof displayClaimItems> }> = []
  const unique = asRecord(comparison.unique_claims_by_strategy)
  for (const [key, items] of Object.entries(unique)) {
    entries.push({ label: strategyLabel(key), strategy: key, items: displayClaimItems(Array.isArray(items) ? items : [items]) })
  }
  return entries
}

export function displayList(items: unknown): string[] {
  if (!Array.isArray(items)) return []
  return items.map((item) => {
    if (typeof item === 'string') return item
    const record = asRecord(item)
    return typeof record.text === 'string' ? record.text : String(item)
  })
}

export function groupHref(groupId: string | number | null | undefined, openReport = false): string {
  if (!groupId) return '/comparisons'
  const reportParam = openReport ? '&md=1' : ''
  return `/comparisons?group=${encodeURIComponent(String(groupId))}${reportParam}`
}
