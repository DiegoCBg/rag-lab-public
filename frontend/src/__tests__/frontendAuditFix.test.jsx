import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@mui/material/styles'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppNav from '../components/AppNav'
import ChunkCard from '../components/ChunkCard'
import BenchmarkPage from '../pages/BenchmarkPage'
import ComparisonPage from '../pages/ComparisonPage'
import ComparisonsPage from '../pages/ComparisonsPage'
import ExperimentsPage from '../pages/ExperimentsPage'
import QueryPage from '../pages/QueryPage'
import { AuthProvider } from '../features/auth/AuthContext'
import { I18nProvider } from '../i18n'
import { lightTheme } from '../theme'
import { useWorkspaceStore } from '../store/workspace'
import {
  parseBenchmarkCompare,
  parseBenchmarkRun,
  parseComparisonGroup,
  parseComparisonGroups,
  parseComparisonRun,
  parseDocuments,
  parseExecutions,
  parseExperiments,
  parseIngestionJob,
  parseLoginResponse,
  parseProviders,
  parseRagQuery,
  parseRagRun,
  parseResetPassword,
  parseSettings,
  parseStrategies,
  parseSystemStatus,
  parseUploadedDocument,
  parseUsers,
} from '../types/contracts'
import { api } from '../api/client'

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  apiErrorMessage: (error, fallback) => error?.response?.data?.detail || fallback,
}))

function renderWithProviders(ui) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={lightTheme}>
        <MemoryRouter>
          <I18nProvider>
            {ui}
          </I18nProvider>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  useWorkspaceStore.setState({
    provider: 'ollama',
    strategy: 'hybrid',
    compareStrategy: 'vector',
    topK: 10,
    contentTypeFilter: '',
    statusFilter: 'indexed',
    questionDraft: '',
  })
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  })
})

describe('frontend audit validators', () => {
  it('accepts expected payloads and rejects invalid shapes', () => {
    expect(parseStrategies([{ id: 'hybrid', label: 'Hybrid' }])).toHaveLength(1)
    expect(parseProviders([{ id: 'ollama', label: 'Ollama' }])).toHaveLength(1)
    expect(parseExperiments([{ id: 1, primary_strategy: 'hybrid', provider: 'ollama', question: 'q' }])).toHaveLength(1)
    expect(parseUsers([{ id: 1, username: 'admin', is_admin: true, is_active: true }])).toHaveLength(1)
    expect(parseSettings({ items: [{ key: 'default_chat_provider', value: 'ollama' }] }).items).toHaveLength(1)
    expect(parseRagQuery({ answer: 'ok', strategy: 'hybrid', provider: 'ollama', sources: [], chunks: [], metrics: {} }).answer).toBe('ok')
    expect(parseRagRun({ results: [{ answer: 'ok', chunks: [{ text: 'source' }] }], events: [] }).results[0].chunks).toHaveLength(1)
    expect(parseBenchmarkRun({ items: [{ question: 'q' }], evaluated_items: 1, total_items: 1 }).items).toHaveLength(1)
    expect(parseBenchmarkCompare({ rows: [{ question: 'q' }], evaluated_items: 1, total_items: 1 }).rows).toHaveLength(1)
    expect(parseDocuments([{ id: 1, filename: 'doc.md', status: 'indexed' }])).toHaveLength(1)
    expect(parseUploadedDocument({ id: 1, filename: 'doc.md', status: 'uploaded' }).filename).toBe('doc.md')
    expect(parseIngestionJob({ job_id: 'job-1', stage: 'queued', progress: 10 }).stage).toBe('queued')
    expect(parseExecutions([{ id: 1, strategy: 'hybrid', sources: [] }])).toHaveLength(1)
    expect(parseComparisonGroups([{ comparison_group_id: 'cmp-1', strategies: ['vector'] }])).toHaveLength(1)
    expect(parseComparisonGroup({ comparison_group_id: 'cmp-1', question: 'q' }).question).toBe('q')
    expect(parseComparisonGroup({
      comparison_group_id: 'cmp-2',
      question: 'q',
      executions: [{
        execution_id: 'exec-1',
        strategy: 'vector',
        status: 'ok',
        chunks: [{ chunk_id: 'chunk-1', filename: 'book.md', text: 'evidence' }],
        analysis: {
          main_topic: 'topic',
          claims: [{ claim_id: 'claim-1', text: 'claim', grounded: true, supporting_quotes: ['evidence'] }],
        },
      }],
      comparison: {
        synthesis_status: 'partial',
        consensus_claims: ['claim'],
        contradictions: [],
        coverage_gaps: [],
        unsupported_claims: [],
        unique_claims_by_strategy: {},
        combined_synthesis: 'partial answer',
      },
    }).executions[0].chunks[0].filename).toBe('book.md')
    expect(parseComparisonRun({ comparison_group_id: 'cmp-1' }).comparison_group_id).toBe('cmp-1')
    expect(parseLoginResponse({ access_token: 'token', token_type: 'bearer' }).access_token).toBe('token')
    expect(parseResetPassword({ new_password: 'secret' }).new_password).toBe('secret')
    expect(parseSystemStatus({ fastapi: { status: 'ok' }, documents: { indexed: 1, total: 2 } }).fastapi?.status).toBe('ok')

    expect(() => parseStrategies([{ id: 1, label: 'bad' }])).toThrow(/Invalid strategies/)
    expect(() => parseExperiments({ id: 1 })).toThrow(/Invalid experiments/)
    expect(() => parseDocuments([{ filename: 'missing-id.md' }])).toThrow(/Invalid documents/)
    expect(() => parseUploadedDocument({ id: 1, filename: 'doc.md' })).toThrow(/Invalid uploaded document/)
    expect(() => parseComparisonRun({ status: 'queued' })).toThrow(/Invalid comparison run/)
    expect(() => parseComparisonGroup({
      comparison_group_id: 'cmp-invalid',
      executions: [{ execution_id: 42, strategy: 'vector', status: 'ok' }],
    })).toThrow(/Invalid comparison group/)
    expect(() => parseLoginResponse({ token_type: 'bearer' })).toThrow(/Invalid login/)
    expect(() => parseResetPassword({})).toThrow(/Invalid reset password/)
  })
})

describe('AppNav logout behavior', () => {
  it('keeps logout accessible and avoids simultaneous desktop duplication', () => {
    const { container } = renderWithProviders(
      <AuthProvider>
        <AppNav />
      </AuthProvider>
    )

    const footerLogout = container.querySelector('.sidebar-logout-button')
    const mobileLogout = container.querySelector('.nav-logout-link')

    expect(footerLogout).toHaveAccessibleName('Encerrar Sessão')
    expect(mobileLogout).toHaveTextContent('Sair')
    expect(container.querySelectorAll('.sidebar-footer .sidebar-logout-button')).toHaveLength(1)
    expect(container.querySelectorAll('.nav-logout-link')).toHaveLength(1)
  })
})

describe('Benchmark and Experiments data flow', () => {
  it('loads benchmark options and posts the same benchmark endpoint payload', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/rag/strategies') return Promise.resolve({ data: [{ id: 'vector', label: 'Vector' }, { id: 'hybrid', label: 'Hybrid' }] })
      if (url === '/providers') return Promise.resolve({ data: [{ id: 'ollama', label: 'Ollama' }] })
      return Promise.reject(new Error(`unexpected ${url}`))
    })
    api.post.mockResolvedValue({
      data: {
        strategy: 'vector',
        provider: 'ollama',
        average_keyword_score: null,
        evaluated_items: 0,
        total_items: 1,
        items: [{ question: 'Qual a origem?', keyword_hits: 0, keyword_total: 0, score_ratio: null }],
      },
    })

    renderWithProviders(<BenchmarkPage />)

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/rag/strategies'))
    expect(api.get).toHaveBeenCalledWith('/providers')

    fireEvent.change(screen.getByPlaceholderText(/Qual a origem/), { target: { value: 'Qual a origem?' } })
    fireEvent.click(screen.getByRole('button', { name: /Rodar benchmark/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/benchmark/run', expect.objectContaining({
      provider: 'ollama',
      strategy: 'vector',
      content_type_filter: null,
      status_filter: 'indexed',
    })))
    expect(api.post).toHaveBeenCalledWith('/experiments', expect.objectContaining({
      question: 'Qual a origem?',
      primary_strategy: 'vector',
      secondary_strategy: null,
      provider: 'ollama',
      summary_json: expect.stringContaining('"kind":"benchmark"'),
    }))
  })

  it('posts compare endpoint with expected keywords parsed from tab-separated input', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/rag/strategies') return Promise.resolve({ data: [{ id: 'vector', label: 'Vector' }, { id: 'hybrid', label: 'Hybrid' }] })
      if (url === '/providers') return Promise.resolve({ data: [{ id: 'ollama', label: 'Ollama' }] })
      return Promise.reject(new Error(`unexpected ${url}`))
    })
    api.post.mockResolvedValue({
      data: {
        primary_strategy: 'vector',
        secondary_strategy: 'hybrid',
        provider: 'ollama',
        primary_average: 0.5,
        secondary_average: 1,
        evaluated_items: 1,
        total_items: 1,
        winner: 'hybrid',
        rows: [{ question: 'Qual a origem?', primary_score: 0.5, secondary_score: 1, evaluated: true, winner: 'hybrid' }],
      },
    })

    renderWithProviders(<BenchmarkPage />)

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/rag/strategies'))
    fireEvent.change(screen.getByPlaceholderText(/Qual a origem/), { target: { value: 'Qual a origem?\tcontrato, cadastro' } })
    fireEvent.click(screen.getByRole('button', { name: /Comparar estratégias/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/benchmark/compare', expect.objectContaining({
      provider: 'ollama',
      primary_strategy: 'vector',
      secondary_strategy: 'hybrid',
      content_type_filter: null,
      status_filter: 'indexed',
      items: [{ question: 'Qual a origem?', expected_keywords: ['contrato', 'cadastro'] }],
    })))
    expect(api.post).toHaveBeenCalledWith('/experiments', expect.objectContaining({
      question: 'Qual a origem?',
      primary_strategy: 'vector',
      secondary_strategy: 'hybrid',
      provider: 'ollama',
      summary_json: expect.stringContaining('"mode":"compare"'),
    }))
    expect(await screen.findByText(/vector vs hybrid/)).toBeInTheDocument()
  })

  it('inserts a literal tab in the benchmark textarea without changing focus', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/rag/strategies') return Promise.resolve({ data: [{ id: 'vector', label: 'Vector' }] })
      if (url === '/providers') return Promise.resolve({ data: [{ id: 'ollama', label: 'Ollama' }] })
      return Promise.reject(new Error(`unexpected ${url}`))
    })

    renderWithProviders(<BenchmarkPage />)
    const textarea = await screen.findByPlaceholderText(/Qual a origem/)
    fireEvent.change(textarea, { target: { value: 'elizabeth ama darcy?' } })
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    fireEvent.keyDown(textarea, { key: 'Tab', code: 'Tab' })

    expect(textarea).toHaveValue('elizabeth ama darcy?\t')
    expect(document.activeElement).toBe(textarea)
  })

  it('loads experiments through the existing endpoint', async () => {
    api.get.mockResolvedValue({
      data: [{
        id: 1,
        primary_strategy: 'hybrid',
        provider: 'ollama',
        question: 'Pergunta auditada',
        summary_json: '{"primary_chunk_count":2}',
      }],
    })

    renderWithProviders(<ExperimentsPage />)

    expect(await screen.findByText(/Pergunta auditada/)).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/experiments')
  })

  it('renders saved benchmark metrics and rows in the experiments history', async () => {
    api.get.mockResolvedValue({
      data: [{
        id: 2,
        primary_strategy: 'vector',
        secondary_strategy: 'hybrid',
        provider: 'ollama',
        question: 'Pergunta benchmark',
        summary_json: JSON.stringify({
          kind: 'benchmark',
          mode: 'compare',
          result: {
            primary_strategy: 'vector',
            secondary_strategy: 'hybrid',
            primary_average: 0.5,
            secondary_average: 1,
            evaluated_items: 1,
            total_items: 1,
            winner: 'hybrid',
            rows: [{ question: 'Pergunta benchmark', primary_score: 0.5, secondary_score: 1, winner: 'hybrid' }],
          },
        }),
      }],
    })

    renderWithProviders(<ExperimentsPage />)

    const card = await screen.findByTestId('experiment-card')
    expect(card).toHaveTextContent('Pergunta benchmark')
    expect(card).toHaveTextContent('0.50')
    expect(card).toHaveTextContent('Vencedor')
  })

  it('keeps the experiments empty state after a valid empty response', async () => {
    api.get.mockResolvedValue({ data: [] })

    renderWithProviders(<ExperimentsPage />)

    expect(await screen.findByText('Nenhum experimento salvo ainda.')).toBeInTheDocument()
  })

  it('shows loading feedback while benchmark options are pending', async () => {
    api.get.mockReturnValue(new Promise(() => {}))

    renderWithProviders(<BenchmarkPage />)

    expect(await screen.findByRole('status')).toHaveTextContent('Carregando...')
  })

  it('shows the existing benchmark error when options fail to load', async () => {
    api.get.mockRejectedValue(new Error('options unavailable'))

    renderWithProviders(<BenchmarkPage />)

    expect(await screen.findByText('Falha ao carregar dados de benchmark')).toBeInTheDocument()
  })

  it('shows the existing experiments error when the query fails', async () => {
    api.get.mockRejectedValue(new Error('experiments unavailable'))

    renderWithProviders(<ExperimentsPage />)

    expect(await screen.findByText('Falha ao carregar experimentos')).toBeInTheDocument()
  })
})

describe('ChunkCard highlight and inspection', () => {
  it('renders safe highlights, copy, and metadata drawer', async () => {
    renderWithProviders(
      <ChunkCard
        chunk={{ rank: 1, filename: 'doc.txt', text: 'O reator de plasma usa refrigeracao.', metadata: { source: 'doc' }, score: 0.7 }}
        highlightTerms={['plasma', '<script>']}
      />
    )

    expect(screen.getByText('plasma')).toBeInTheDocument()
    expect(screen.getByText('plasma').tagName).toBe('MARK')

    fireEvent.click(screen.getByLabelText('Copiar texto do chunk'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('O reator de plasma usa refrigeracao.')

    fireEvent.click(screen.getByLabelText('Abrir metadados do chunk'))
    expect(await screen.findByText(/Metadados Brutos/)).toBeInTheDocument()
    expect(screen.queryByText('<script>')).not.toBeInTheDocument()
  })
})

describe('QueryPage pending feedback', () => {
  it('shows pending feedback and prevents duplicate runs', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/documents') return Promise.resolve({ data: [{ id: 1, filename: 'test.pdf', status: 'indexed' }, { id: 2, filename: 'other.pdf', status: 'indexed' }] })
      if (url === '/rag/strategies') return Promise.resolve({ data: [{ id: 'hybrid', label: 'Hybrid' }] })
      if (url === '/providers') return Promise.resolve({ data: [{ id: 'ollama', label: 'Ollama' }] })
      if (url === '/system/status') return Promise.resolve({ data: { documents: { indexed: 1, total: 1 } } })
      return Promise.reject(new Error(`unexpected ${url}`))
    })
    api.post.mockReturnValue(new Promise(() => {}))

    const { container } = renderWithProviders(<QueryPage />)

    const input = await screen.findByPlaceholderText(/Digite a pergunta/)
    fireEvent.change(input, { target: { value: 'Como funciona o plasma?' } })
    const button = screen.getByRole('button', { name: /Executar Pergunta/ })
    await waitFor(() => expect(button).not.toBeDisabled())
    fireEvent.click(button)

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/rag/runs', expect.objectContaining({
      mode: 'single',
      question: 'Como funciona o plasma?',
      strategies: ['hybrid'],
      provider: 'ollama',
      top_k: 10,
      content_type_filter: null,
      status_filter: null,
    })))

    expect(button).toBeDisabled()
    expect(container.querySelector('.query-skeleton')).toBeInTheDocument()
    expect(container.querySelector('.pipeline-elapsed')).toHaveTextContent(/\d+s/)
  })

  it('validates an empty question and clears the error when a suggestion is selected', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/documents') return Promise.resolve({ data: [{ id: 1, filename: 'test.pdf', status: 'indexed' }] })
      if (url === '/rag/strategies') return Promise.resolve({ data: [{ id: 'hybrid', label: 'Hybrid' }] })
      if (url === '/providers') return Promise.resolve({ data: [{ id: 'ollama', label: 'Ollama' }] })
      if (url === '/system/status') return Promise.resolve({ data: { documents: { indexed: 2, total: 3 } } })
      return Promise.reject(new Error(`unexpected ${url}`))
    })

    renderWithProviders(<QueryPage />)

    const input = await screen.findByPlaceholderText(/Digite a pergunta/)
    const button = screen.getByRole('button', { name: /Executar Pergunta/ })
    await waitFor(() => expect(button).not.toBeDisabled())
    fireEvent.click(button)

    expect(screen.getByText('Digite uma pergunta para continuar')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Quais são os principais riscos citados?' }))

    expect(input).toHaveValue('Quais são os principais riscos citados?')
    expect(screen.queryByText('Digite uma pergunta para continuar')).not.toBeInTheDocument()
  })

  it('reveals additional question suggestions on demand', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/rag/strategies') return Promise.resolve({ data: [{ id: 'hybrid', label: 'Hybrid' }] })
      if (url === '/providers') return Promise.resolve({ data: [{ id: 'ollama', label: 'Ollama' }] })
      if (url === '/system/status') return Promise.resolve({ data: { documents: { indexed: 2, total: 3 } } })
      return Promise.reject(new Error(`unexpected ${url}`))
    })

    renderWithProviders(<QueryPage />)

    expect(screen.queryByRole('button', { name: 'Existem contradições entre os documentos?' })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Mais sugestões' }))
    expect(screen.getByRole('button', { name: 'Existem contradições entre os documentos?' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar menos' }))
    expect(screen.queryByRole('button', { name: 'Existem contradições entre os documentos?' })).not.toBeInTheDocument()
  })
})

describe('Comparison top_k control', () => {
  it('uses the shared top_k slider in direct comparison', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/documents') return Promise.resolve({ data: [{ id: 1, filename: 'test.pdf', status: 'indexed' }, { id: 2, filename: 'other.pdf', status: 'indexed' }] })
      if (url === '/rag/strategies') return Promise.resolve({ data: [{ id: 'vector', label: 'Vector' }, { id: 'hybrid', label: 'Hybrid' }] })
      if (url === '/providers') return Promise.resolve({ data: [{ id: 'ollama', label: 'Ollama' }] })
      return Promise.reject(new Error(`unexpected ${url}`))
    })
    api.post.mockImplementation((url) => {
      if (url === '/rag/runs') return Promise.resolve({ data: {
        run_id: 'run-1', mode: 'comparison', status: 'completed', question: 'q', provider: 'ollama',
        strategies: ['vector', 'hybrid'], results: [
          { answer: 'a', strategy: 'hybrid', provider: 'ollama', sources: [], chunks: [], metrics: {} },
          { answer: 'b', strategy: 'hybrid', provider: 'ollama', sources: [], chunks: [], metrics: {} },
        ], synthesis: {}, events: [],
      } })
      return Promise.resolve({ data: {} })
    })

    renderWithProviders(<ComparisonPage />)
    const slider = await screen.findByRole('slider', { name: 'Quantidade de trechos usados na resposta' })
    fireEvent.change(slider, { target: { value: 25 } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Pergunta para Teste' }), { target: { value: 'q' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Comparar' })).not.toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/rag/runs', expect.objectContaining({ top_k: 25 })))
  })

  it('sends the shared top_k in persisted comparisons', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/documents') return Promise.resolve({ data: [{ id: 1, filename: 'test.pdf', status: 'indexed' }] })
      if (url === '/comparisons') return Promise.resolve({ data: [] })
      if (url === '/comparisons/cmp-1') return Promise.resolve({ data: { comparison_group_id: 'cmp-1', strategies: ['vector'], executions: [], comparison: {} } })
      return Promise.reject(new Error(`unexpected ${url}`))
    })
    api.post.mockResolvedValue({ data: { comparison_group_id: 'cmp-1' } })

    renderWithProviders(<ComparisonsPage />)
    const slider = await screen.findByRole('slider', { name: 'Quantidade de trechos usados na resposta' })
    fireEvent.change(slider, { target: { value: 50 } })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'q' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Executar Comparação Conjunta' })).not.toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: 'Executar Comparação Conjunta' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/comparisons', expect.objectContaining({ top_k: 50 })))
  })
})
