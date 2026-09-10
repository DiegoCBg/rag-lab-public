import { describe, expect, it } from 'vitest'
import { parseComparisonGroup } from '../types/contracts'

describe('contrato de comparação', () => {
  it('aceita informação exclusiva como texto ou lista', () => {
    const parsed = parseComparisonGroup({
      comparison_group_id: 'cmp_contract_1',
      question: 'pergunta',
      executions: [{
        execution_id: 'exec_contract_1',
        strategy: 'hybrid',
        status: 'ok',
        analysis: {
          claims: [{
            text: 'afirmação',
            supporting_quotes: [{ chunk_id: 'chunk_1', quote: 'trecho de evidência' }],
          }],
        },
      }],
      documents: [],
      comparison: {
        synthesis_status: 'partial',
        unique_claims_by_strategy: {
          'Estratégia 1': 'afirmação exclusiva em texto',
          'Estratégia 2': ['afirmação exclusiva em lista'],
        },
      },
    })

    expect(parsed.comparison).toBeTruthy()
    expect(parsed.comparison?.unique_claims_by_strategy).toEqual({
      'Estratégia 1': ['afirmação exclusiva em texto'],
      'Estratégia 2': ['afirmação exclusiva em lista'],
    })
    expect(parsed.executions[0].analysis?.claims[0].supporting_quotes).toEqual(['trecho de evidência'])
  })
})
