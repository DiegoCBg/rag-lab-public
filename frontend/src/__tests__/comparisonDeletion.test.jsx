import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, vi } from 'vitest'
import ComparisonsPage from '../pages/ComparisonsPage'
import { api } from '../api/client'

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
  apiErrorMessage: vi.fn((_, fallback) => fallback),
}))

const group = {
  comparison_group_id: 'cmp_delete_1',
  question: 'Qual é a relação entre dever e honra?',
  created_at: '2026-08-13T12:59:01Z',
  status: 'completed',
  synthesis_status: 'valid',
  strategies: ['vector', 'hybrid'],
  documents: ['livro.pdf'],
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>
      <ComparisonsPage />
    </MemoryRouter></QueryClientProvider>,
  )
}

describe('exclusão de grupos persistidos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: [group] })
  })

  it('exige confirmação e mantém o grupo quando a exclusão é cancelada', async () => {
    renderPage()

    const deleteButton = await screen.findByRole('button', { name: 'Excluir comparação' })
    fireEvent.click(deleteButton)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(group.question)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(api.delete).not.toHaveBeenCalled()
    expect(screen.getByText(group.question)).toBeInTheDocument()
  })

  it('exclui o grupo após confirmação e remove a linha do histórico', async () => {
    api.delete.mockResolvedValue({ data: { deleted: true, cleanup_warnings: [] } })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Excluir comparação' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir comparação' }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/comparisons/cmp_delete_1')
    })
    expect(screen.queryByText(group.question)).not.toBeInTheDocument()
    expect(screen.getByText('Comparação excluída do histórico.')).toBeInTheDocument()
  })

  it('mantém o grupo quando o backend recusa a exclusão', async () => {
    api.delete.mockRejectedValue({
      response: { status: 409, data: { detail: 'A comparação ainda está em execução e não pode ser excluída.' } },
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Excluir comparação' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir comparação' }))

    await waitFor(() => {
      expect(screen.getAllByText(group.question).length).toBeGreaterThan(0)
      expect(screen.getByText('Não foi possível excluir a comparação.')).toBeInTheDocument()
    })
  })
})
