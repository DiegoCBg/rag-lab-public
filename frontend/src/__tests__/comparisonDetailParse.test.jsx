import { describe, it, expect } from 'vitest'
import { parseComparisonGroup } from '../types/contracts'

const payload = {
  comparison_group_id: 'cmp_20260819194807-ce83',
  created_at: '2026-08-19T19:48:07',
  question: 'Rastreie a evolução do sentimento de Elizabeth Bennet em relação a Mr. Darcy.',
  documents: ['orgulho_e_preconceito.pdf'],
  status: 'completed',
  executions: [
    {
      execution_id: 'exec_1',
      strategy: 'hybrid',
      provider: 'ollama',
      status: 'ok',
      raw_answer: 'resposta bruta',
      chunks: [],
      analysis: {
        main_topic: 'sentimento',
        claims: [
          {
            claim_id: 'c1',
            text: 'afirmação',
            type: 'fact',
            grounded: true,
            supporting_chunk_ids: ['chunk_0'],
            supporting_quotes: [{ quote: 'citação' }],
          },
        ],
        subtopics: 'subtema como string',
        conclusions: 'conclusão como string',
        information_omitted_from_answer: 'omitido',
        unsupported_claims: ['não sustentado'],
      },
    },
  ],
  comparison: {
    shared_main_topic: 'tema',
    synthesis_status: 'invalid',
    unique_claims_by_strategy: { 'Estratégia 1': 'texto único' },
    consensus_claims: [],
    equivalent_claims: [],
    contradictions: [],
    coverage_gaps: ['ausência de cobertura'],
    unsupported_claims: ['alucinação'],
    synthesis_reason: 'evidências insuficientes',
    combined_synthesis: '',
  },
}

describe('parseComparisonGroup tolera analysis com listas como string', () => {
  it('aceita subtopics/conclusions/omitted como string (dado real do backend)', () => {
    const parsed = parseComparisonGroup(payload)
    expect(parsed.comparison_group_id).toBe('cmp_20260819194807-ce83')
    const analysis = parsed.executions[0].analysis
    expect(Array.isArray(analysis.subtopics)).toBe(true)
    expect(Array.isArray(analysis.conclusions)).toBe(true)
    expect(Array.isArray(analysis.information_omitted_from_answer)).toBe(true)
    expect(Array.isArray(analysis.unsupported_claims)).toBe(true)
  })

  it('mantém claims e unique_claims_by_strategy como array', () => {
    const parsed = parseComparisonGroup(payload)
    expect(Array.isArray(parsed.executions[0].analysis.claims)).toBe(true)
    expect(Array.isArray(parsed.comparison.unique_claims_by_strategy['Estratégia 1'])).toBe(true)
  })

  it('aceita IDs numéricos produzidos por análises reais', () => {
    const parsed = parseComparisonGroup({
      ...payload,
      executions: [{
        ...payload.executions[0],
        analysis: {
          ...payload.executions[0].analysis,
          claims: [{
            ...payload.executions[0].analysis.claims[0],
            supporting_chunk_ids: [1, 2, 3],
            evidence_ids: [4],
            section_ids: [5],
          }],
        },
      }],
    })

    expect(parsed.executions[0].analysis.claims[0].supporting_chunk_ids).toEqual(['1', '2', '3'])
    expect(parsed.executions[0].analysis.claims[0].evidence_ids).toEqual(['4'])
    expect(parsed.executions[0].analysis.claims[0].section_ids).toEqual(['5'])
  })
})
