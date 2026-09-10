import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppNav from '../components/AppNav'
import ComparisonDetailGrid from '../components/ComparisonDetailGrid'
import ResultFlow from '../components/ResultFlow'
import SemanticComparison from '../components/SemanticComparison'
import { AuthProvider } from '../features/auth/AuthContext'

const resultHybrid = {
  strategy: 'hybrid',
  provider: 'ollama',
  answer: 'Resposta Hybrid original: personas históricas e arquitetura do reator de plasma.',
  chunks: ['trecho A'],
  sources: ['litografia.pdf'],
  metrics: { retrieval_ms: 52.1, llm_ms: 800, chunk_count: 5, source_count: 2, answer_length: 210 },
}

const resultVector = {
  strategy: 'vector',
  provider: 'ollama',
  answer: 'Resposta Vector original: somente a criação de personas históricas.',
  chunks: ['trecho B'],
  sources: ['ROMPT-MESTRE V2.0.txt'],
  metrics: { retrieval_ms: 41.7, llm_ms: 640, chunk_count: 3, source_count: 1, answer_length: 150 },
}

const comparisonBase = {
  synthesis_status: 'valid',
  synthesis_reason: 'as afirmações convergem nos pontos centrais.',
  combined_synthesis: 'Síntese combinada de referência: os dois assuntos quando houver suporte.',
  consensus_claims: ['Afirmação comum entre as estratégias'],
  equivalent_claims: [],
  unique_claims_by_strategy: { hybrid: ['Detalhe exclusivo do Hybrid'], vector: ['Detalhe exclusivo do Vector'] },
  contradictions: ['afirmação A incompatível com afirmação B'],
  coverage_gaps: ['gap de cobertura'],
  unsupported_claims: ['afirmação sem evidência'],
}

const groupDocumentos = {
  comparison_group_id: 'cmp_1',
  status: 'completed',
  question: 'pergunta',
  documents: ['litografia.pdf', 'ROMPT-MESTRE V2.0.txt'],
  executions: [
    { strategy: 'hybrid', status: 'ok', analysis: { main_topic: 'personas históricas e arquitetura de reator de plasma' }, chunks: [{ filename: 'litografia.pdf' }] },
    { strategy: 'vector', status: 'ok', analysis: { main_topic: 'personas históricas' }, chunks: [{ filename: 'ROMPT-MESTRE V2.0.txt' }] },
  ],
  comparison: comparisonBase,
}

const groupMesmaDoc = {
  comparison: comparisonBase,
  status: 'completed',
  documents: ['litografia.pdf'],
  executions: [
    { strategy: 'hybrid', status: 'ok', analysis: { main_topic: 'personas e reator de plasma' }, chunks: [{ filename: 'litografia.pdf' }] },
    { strategy: 'vector', status: 'ok', analysis: { main_topic: 'personas históricas' }, chunks: [{ filename: 'litografia.pdf' }] },
  ],
}

function renderFlow(group = groupDocumentos, status = 'done') {
  return render(
    <ResultFlow
      primary={resultHybrid}
      secondary={resultVector}
      semanticGroup={group}
      semanticStatus={status}
    />
  )
}

describe('Comparação do conteúdo — integração visual', () => {
  it('1. aparece depois das respostas das estratégias', () => {
    const { container } = renderFlow()
    const html = container.innerHTML
    const idxAnswerHybrid = html.indexOf('Resposta — Hybrid')
    const idxAnswerVector = html.indexOf('Resposta — Vector')
    const idxContent = html.indexOf('Comparação do conteúdo')
    const idxPerformance = html.indexOf('Comparação de desempenho')
    expect(idxAnswerHybrid).toBeGreaterThanOrEqual(0)
    expect(idxAnswerVector).toBeGreaterThanOrEqual(0)
    expect(idxContent).toBeGreaterThan(idxAnswerVector)
    expect(idxPerformance).toBeGreaterThan(idxContent)
  })

  it('2. consenso (núcleo comum) é mostrado', () => {
    render(<SemanticComparison group={groupDocumentos} status="done" />)
    expect(screen.getByText(/Núcleo comum/)).toBeInTheDocument()
    expect(screen.getByText('Afirmação comum entre as estratégias')).toBeInTheDocument()
  })

  it('3. informações exclusivas separadas por estratégia', () => {
    render(<SemanticComparison group={groupDocumentos} status="done" />)
    expect(screen.getByText('Somente Hybrid')).toBeInTheDocument()
    expect(screen.getByText('Somente Vector')).toBeInTheDocument()
    expect(screen.getByText('Detalhe exclusivo do Hybrid')).toBeInTheDocument()
    expect(screen.getByText('Detalhe exclusivo do Vector')).toBeInTheDocument()
  })

  it('4. contradições e divergências são mostradas', () => {
    render(<SemanticComparison group={groupDocumentos} status="done" />)
    expect(screen.getByText(/Contradição:/)).toBeInTheDocument()
    expect(screen.getByText(/afirmação A incompatível com afirmação B/)).toBeInTheDocument()
    expect(screen.getByText(/uma estratégia encontrou informação que outra não encontrou/)).toBeInTheDocument()
  })

  it('5. validade da junção com estado inequívoco (válida)', () => {
    render(<SemanticComparison group={groupMesmaDoc} status="done" />)
    expect(screen.getByText('É possível juntar?')).toBeInTheDocument()
    expect(screen.getByTestId('juncao-status')).toHaveTextContent('Junção válida')
  })

  it('6. justificativa da validade é exibida imediatamente', () => {
    render(<SemanticComparison group={groupMesmaDoc} status="done" />)
    expect(screen.getByTestId('juncao-reason')).toHaveTextContent('as afirmações convergem nos pontos centrais.')
  })

  it('7. síntese conjunta é mostrada', () => {
    render(<SemanticComparison group={groupDocumentos} status="done" />)
    expect(screen.getByText('Síntese conjunta')).toBeInTheDocument()
    expect(screen.getByText(comparisonBase.combined_synthesis)).toBeInTheDocument()
  })

it('11. mistura de documentos gera aviso visível e junção parcial', () => {
    render(<SemanticComparison group={groupDocumentos} status="done" />)
    const notice = within(screen.getByTestId('mixed-documents-warning'))
    expect(screen.getByTestId('mixed-documents-warning')).toBeInTheDocument()
    expect(notice.getByText(/documentos diferentes/i)).toBeInTheDocument()
    expect(screen.getByTestId('juncao-status')).toHaveTextContent('Junção parcialmente válida')
  })

  it('12. respostas originais e evidências permanecem visíveis', () => {
    renderFlow()
    expect(screen.getByText('Resposta Hybrid original: personas históricas e arquitetura do reator de plasma.')).toBeInTheDocument()
    expect(screen.getByText('Resposta Vector original: somente a criação de personas históricas.')).toBeInTheDocument()
    expect(screen.getByText('trecho A')).toBeInTheDocument()
    expect(screen.getByText('trecho B')).toBeInTheDocument()
  })
})

describe('Estados da interface', () => {
  it('analisando conteúdo das respostas', () => {
    render(<SemanticComparison status="loading" />)
    expect(screen.getByText(/Analisando o conteúdo das respostas\.\.\./)).toBeInTheDocument()
  })

  it('não foi possível comparar', () => {
    render(<SemanticComparison status="failed" error="timeout" />)
    expect(screen.getByText(/Não foi possível comparar/)).toBeInTheDocument()
  })

  it('parcial preserva respostas e análises', () => {
    const groupPartial = {
      ...groupDocumentos,
      status: 'partial_failed',
      executions: [
        ...groupDocumentos.executions,
        { strategy: 'vector', status: 'error', chunks: [], raw_answer: 'resposta parcial' },
      ],
    }
    render(<SemanticComparison group={groupPartial} status="partial" />)
    expect(screen.getByText(/Comparação parcialmente concluída/)).toBeInTheDocument()
    expect(screen.getByText(/Tema identificado: personas históricas e arquitetura de reator de plasma/)).toBeInTheDocument()
  })

  it('síntese disponível com status parcial continua visível com aviso', () => {
    const groupInvalid = {
      comparison_group_id: 'g_2',
      executions: [
        { strategy: 'hybrid', status: 'ok', analysis: { main_topic: 'A' }, chunks: [{ filename: 'a.pdf' }] },
        { strategy: 'vector', status: 'ok', analysis: { main_topic: 'B' }, chunks: [{ filename: 'a.pdf' }] },
      ],
      comparison: {
        synthesis_status: 'invalid',
        synthesis_reason: 'respostas incompatíveis',
        combined_synthesis: 'RESPOSTA FALSA QUE NÃO DEVE APARECER',
        consensus_claims: [],
        unique_claims_by_strategy: {},
        contradictions: [],
        unsupported_claims: [],
        coverage_gaps: [],
      },
    }
    render(<SemanticComparison group={groupInvalid} status="done" />)
    expect(screen.getByTestId('juncao-status')).toHaveTextContent('Junção parcialmente válida')
    expect(screen.getByText('RESPOSTA FALSA QUE NÃO DEVE APARECER')).toBeInTheDocument()
    expect(screen.getByText(/Síntese disponível com confiabilidade parcial/)).toBeInTheDocument()
  })
})

describe('Desempenho separado e navegação', () => {
  it('8. comparação de desempenho permanece em seção separada', () => {
    renderFlow()
    expect(screen.getByText('Comparação de desempenho')).toBeInTheDocument()
    expect(screen.getByText(/Diferença de chunks/)).toBeInTheDocument()
  })

it('9. navegação histórica permanece na sidebar', () => {
    render(<MemoryRouter><AuthProvider><AppNav /></AuthProvider></MemoryRouter>)
    const link = screen.getByRole('link', { name: /Comparações/ })
    expect(link).toHaveAttribute('href', '/comparisons')
    expect(screen.getByRole('link', { name: 'Histórico de Runs' })).toHaveAttribute('href', '/executions')
    expect(screen.getByRole('link', { name: 'Configurações' })).toHaveAttribute('href', '/settings')
    expect(screen.getAllByTestId('nav-item').length).toBe(8)
  })

  it('10. relatório Markdown persistido é acessível', () => {
    renderFlow()
    expect(screen.getByTestId('report-link')).toHaveAttribute('href', '/comparisons?group=cmp_1&md=1')
    expect(screen.getByText('Ver relatório')).toBeInTheDocument()
    expect(screen.getByText('Ver comparação completa')).toBeInTheDocument()
  })
})

describe('Grade visual da comparação (ComparisonDetailGrid)', () => {
  const richGroup = {
    comparison_group_id: 'cmp_g1',
    status: 'completed',
    question: 'pergunta rica',
    documents: ['litografia.pdf'],
    executions: [
      {
        execution_id: 'e1',
        strategy: 'hybrid',
        status: 'ok',
        raw_answer: 'Resposta bruta do Hybrid.',
        analysis: {
          main_topic: 'personas históricas',
          claims: [
            { claim_id: 'c1', text: 'afirmação 1', type: 'fact', grounded: true, supporting_chunk_ids: ['x'] },
            { claim_id: 'c2', text: 'afirmação 2', type: 'interpretation', grounded: false, supporting_chunk_ids: [] },
          ],
        },
        chunks: [{ filename: 'litografia.pdf' }],
      },
      {
        execution_id: 'e2',
        strategy: 'vector',
        status: 'error',
        raw_answer: null,
        error: 'falha simulada',
        chunks: [],
      },
    ],
    comparison: {
      synthesis_status: 'valid',
      synthesis_reason: 'convergem',
      combined_synthesis: 'síntese rica',
      consensus_claims: [{ claim_id: 'c1', text: 'consenso' }],
      unique_claims_by_strategy: { hybrid: [{ claim_id: 'x1', text: 'exclusivo hybrid' }] },
      contradictions: [{ claim_id: 'y1', text: 'contra 1' }],
      coverage_gaps: [],
      unsupported_claims: [{ claim_id: 'UC1', text: 'afirmação sem suporte documental' }],
      retrieval_quality: [
        { strategy: 'hybrid', status: 'complete' },
        {
          strategy: 'vector',
          status: 'partial',
          query_coverage: { coverage: 0.82, covered_sections: ['s1', 's2'] },
        },
      ],
    },
  }

  it('exibe respostas brutas e status por estratégia', () => {
    render(<ComparisonDetailGrid group={richGroup} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Respostas por estratégia' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ver resposta completa' }))
    expect(screen.getByText('Resposta bruta do Hybrid.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'RAG Vetorial' }))
    expect(screen.getByText('falha simulada')).toBeInTheDocument()
  })

  it('tabela de claims com evidência marcada', () => {
    render(<ComparisonDetailGrid group={richGroup} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Respostas por estratégia' }))
    const rows = screen.getAllByTestId('claim-row')
    expect(rows).toHaveLength(2)
    expect(screen.getAllByTestId('claim-row')[0]).toHaveTextContent('afirmação 1')
    expect(screen.getAllByTestId('claim-row')[0]).toHaveTextContent('Fato')
    expect(screen.getAllByText('com evidência')).toHaveLength(1)
    expect(screen.getAllByText('sem evidência')).toHaveLength(1)
  })

  it('contradições, consenso e síntese na grade', () => {
    render(<ComparisonDetailGrid group={richGroup} />)
    expect(screen.getByText('consenso')).toBeInTheDocument()
    expect(screen.getByText('síntese rica')).toBeInTheDocument()
    expect(screen.queryByTestId('contradiction-0')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Divergências' }))
    expect(screen.getByTestId('contradiction-0')).toHaveTextContent('contra 1')
  })

  it('expande e recolhe síntese e avaliação juntas mantendo blocos separados', () => {
    const group = {
      ...richGroup,
      comparison: {
        ...richGroup.comparison,
        combined_synthesis: 'A conclusão principal termina com uma frase completa, sem corte.\n\n1. Detalhe visível da análise.\n\n2. Detalhe recolhido da análise completa.',
      },
    }
    render(<ComparisonDetailGrid group={group} />)
    const synthesisPreview = screen.getByText('Síntese da comparação').closest('article')
    expect(within(synthesisPreview).getByText('A conclusão principal termina com uma frase completa, sem corte.')).toBeInTheDocument()
    expect(within(synthesisPreview).getByText('Detalhe visível da análise.')).toBeInTheDocument()
    expect(within(synthesisPreview).queryByText('Detalhe recolhido da análise completa.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ler síntese completa' }))
    expect(within(synthesisPreview).getByText('Detalhe recolhido da análise completa.')).toBeInTheDocument()
    expect(screen.getByText('convergem')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Por que esta avaliação?'))
    expect(within(synthesisPreview).queryByText('Detalhe recolhido da análise completa.')).not.toBeInTheDocument()
  })

  it('informações exclusivas em formato de objeto {claim_id, text} não quebram a grade', () => {
    render(<ComparisonDetailGrid group={richGroup} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Exclusivas' }))
    expect(screen.getAllByText('RAG Híbrido').length).toBeGreaterThan(0)
    expect(screen.getByText('exclusivo hybrid')).toBeInTheDocument()
    expect(screen.queryByText('Não confirmada pelas demais estratégias.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Divergências' }))
    expect(screen.queryByText('exclusivo hybrid')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Afirmações sem evidência' }))
    expect(screen.getByText('afirmação sem suporte documental')).toBeInTheDocument()
  })

  it('rastreabilidade fica compacta e abre detalhes sob demanda', () => {
    render(<ComparisonDetailGrid group={richGroup} />)
    expect(screen.getByText('Rastreabilidade da recuperação')).toBeInTheDocument()
    expect(screen.getByText('1 completas · 1 parciais')).toBeInTheDocument()
    expect(screen.queryByText(/ready_deep/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Inspecionar rastreabilidade' }))
  })
})


