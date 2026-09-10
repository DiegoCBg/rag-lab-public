import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import { api } from '../api/client'
import { useWorkspaceStore } from '../store/workspace'
import DocumentSelector, { useDocumentSelection } from '../components/DocumentSelector'
import QueryPage from '../pages/QueryPage'
import ComparisonPage from '../pages/ComparisonPage'
import ComparisonsPage from '../pages/ComparisonsPage'

vi.mock('../api/client', () => ({ api: { get: vi.fn(), post: vi.fn() }, apiErrorMessage: (_, fallback) => fallback }))
const documents = [1, 2].map((id) => ({ id, filename: 'same-name.pdf', status: 'indexed', content_type: 'pdf' }))
beforeEach(() => {
  vi.clearAllMocks()
  useWorkspaceStore.setState({ documentScopeMode: 'selected', selectedDocumentIds: ['1', '2'],
    contentTypeFilter: '', statusFilter: 'indexed', topK: 50, questionDraft: 'Test question', strategy: 'hybrid', compareStrategy: 'vector' })
  api.get.mockImplementation(async (url) => ({ data: url === '/documents' ? documents : url === '/rag/strategies'
    ? [{ id: 'vector', label: 'Vector' }, { id: 'hybrid', label: 'Hybrid' }] : url === '/providers'
      ? [{ id: 'ollama', label: 'Ollama' }] : url === '/system/status' ? {} : [] }))
  api.post.mockReturnValue(new Promise(() => {}))
})
function mount(node) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { ...render(<QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>), client }
}

it.each([
  [QueryPage, 'Executar Pergunta', '/rag/runs'],
  [ComparisonPage, 'Comparar', '/rag/runs'],
  [ComparisonsPage, 'Executar Comparação Conjunta', '/comparisons'],
])('sends the same selected scope from %s', async (Page, label, endpoint) => {
  mount(<Page />)
  if (Page === ComparisonsPage) fireEvent.change(screen.getByPlaceholderText(/Digite a pergunta/), { target: { value: 'Test question' } })
  const button = screen.getByRole('button', { name: label })
  await waitFor(() => expect(button).not.toBeDisabled())
  fireEvent.click(button)
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(endpoint, expect.objectContaining({
    document_scope: 'selected', document_ids: ['1', '2'], top_k: 50,
  })))
  expect(screen.getByRole('button', { name: 'Todos' })).toBeDisabled()
})

function Harness() {
  const selection = useDocumentSelection()
  return <><DocumentSelector selection={selection} /><button disabled={!selection.valid}>Run</button></>
}

it('does not expose type or status filters in the document scope control', async () => {
  mount(<Harness />)
  await screen.findByRole('button', { name: 'Escolher arquivos' })
  expect(screen.queryByText('Tipo de arquivo')).not.toBeInTheDocument()
  expect(screen.queryByText('Status')).not.toBeInTheDocument()
})

it('canceling from all documents does not change the active scope', async () => {
  useWorkspaceStore.setState({ documentScopeMode: 'all', selectedDocumentIds: [] })
  mount(<Harness />)
  fireEvent.click(await screen.findByRole('button', { name: 'Selecionar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(useWorkspaceStore.getState().documentScopeMode).toBe('all')
  expect(useWorkspaceStore.getState().selectedDocumentIds).toEqual([])
})

it('clearing selected documents never switches to all', async () => {
  mount(<Harness />)
  fireEvent.click(await screen.findByRole('button', { name: 'Escolher arquivos' }))
  fireEvent.click(await screen.findByRole('checkbox', { name: /same-name\.pdf.*ID 1/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: /same-name\.pdf.*ID 2/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar seleção' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(useWorkspaceStore.getState().documentScopeMode).toBe('selected')
  expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
})

it('preserves a disappeared document until explicitly removed', async () => {
  const { client } = mount(<Harness />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: 'Escolher arquivos' }))
  api.get.mockResolvedValue({ data: [documents[0]] })
  await act(async () => { await client.refetchQueries({ queryKey: ['documents'] }) })
  expect(await screen.findByRole('checkbox', { name: /Arquivo indisponível.*ID 2/ })).toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
  expect(useWorkspaceStore.getState().selectedDocumentIds).toEqual(['1', '2'])
})
