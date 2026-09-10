import { describe, expect, it } from 'vitest'
import { buildRagAnswerDisplay } from '../utils/ragAnswer'

describe('buildRagAnswerDisplay', () => {
  it('exibe as claims fundamentadas imediatamente após o resumo curto', () => {
    const answer = buildRagAnswerDisplay({
      answer: 'Resumo inicial.',
      claims: [
        { text: 'A carta altera a decisão de Darcy.', type: 'fact', grounded: true },
        { text: 'A carta produz uma mudança emocional.', type: 'interpretation', grounded: true },
      ],
      limitations: ['A cobertura foi parcial.'],
    })

    expect(answer).toContain('Resumo inicial.')
    expect(answer).toContain('A carta altera a decisão de Darcy.')
    expect(answer).toContain('A carta produz uma mudança emocional.')
    expect(answer).toContain('A cobertura foi parcial.')
  })

  it('não duplica uma claim já presente na resposta', () => {
    const answer = buildRagAnswerDisplay({
      answer: 'A carta altera a decisão de Darcy.',
      claims: [{ text: 'A carta altera a decisão de Darcy.', grounded: true }],
    })

    expect(answer.match(/A carta altera a decisão de Darcy\./g)).toHaveLength(1)
  })
})

