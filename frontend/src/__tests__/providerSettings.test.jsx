import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@mui/material/styles'
import { describe, expect, it, vi } from 'vitest'
import ProvidersTab from '../pages/settings/ProvidersTab'
import { lightTheme } from '../theme'
import { api } from '../api/client'

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
  apiErrorMessage: (error, fallback) => error?.response?.data?.detail || fallback,
}))

const translations = {
  'settingsPage.providers.test': 'Testar conexão',
  'settingsPage.providers.customModel': 'Outro modelo',
  'settingsPage.providers.model': 'Modelo de geração',
  'settingsPage.providers.apiKey': 'API Key',
  'settingsPage.providers.saveError': 'save error',
  'settingsPage.providers.loadError': 'load error',
  'settingsPage.providers.testError': 'test error',
  'settingsPage.providers.saved': 'saved',
  'settingsPage.providers.testing': 'Testando',
  'settingsPage.providers.configured': 'Configurado',
  'settingsPage.providers.notConfigured': 'Não configurado',
  'settingsPage.providers.ready': 'Pronto',
  'settingsPage.providers.configureHint': 'Configure',
  'common.save': 'Salvar',
  'common.saving': 'Salvando',
  'queryPage.providerNotConfigured': 'não configurado',
}

const t = (key) => translations[key] || key

function renderTab() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={lightTheme}>
        <ProvidersTab t={t} showSnack={vi.fn()} />
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

function providersPayload() {
  return [
    { id: 'ollama', label: 'Ollama (local)', selected_model: 'llama3.1', configured: true, can_use: true, models: [] },
    { id: 'openai', label: 'OpenAI API', api_key_key: 'openai_api_key', model_key: 'openai_model', selected_model: 'gpt-5-mini', configured: true, can_use: true, models: [{ id: 'gpt-5-mini', label: 'gpt-5-mini' }], supports_custom_model: true },
  ]
}

describe('ProvidersTab', () => {
  it('exibe modelo sugerido, testa conexão e salva modelo customizado', async () => {
    const settingsResponse = {
      data: {
        items: [
          { key: 'openai_api_key', value: 'sk-s...1234', is_set: true, is_secret: true },
          { key: 'openai_model', value: 'gpt-5-mini' },
          { key: 'default_chat_provider', value: 'ollama' },
          { key: 'default_rag_strategy', value: 'hybrid' },
        ],
      },
    }
    api.get.mockImplementation((url) => {
      if (url === '/settings') return Promise.resolve(settingsResponse)
      if (url === '/providers') return Promise.resolve({ data: providersPayload() })
      if (url === '/rag/strategies') return Promise.resolve({ data: [{ id: 'hybrid', label: 'Hybrid' }] })
      return Promise.reject(new Error(`unexpected ${url}`))
    })
    api.post.mockResolvedValue({ data: { provider: 'openai', ok: true, model: 'gpt-5-mini', latency_ms: 12 } })
    api.patch.mockResolvedValue(settingsResponse)

    renderTab()

    expect(await screen.findByText('gpt-5-mini')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Testar conexão' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/providers/openai/test'))

    fireEvent.mouseDown(screen.getAllByRole('combobox')[1])
    fireEvent.click(await screen.findByText('Outro modelo'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Outro modelo' }), { target: { value: 'modelo-customizado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/settings', {
      items: { openai_api_key: 'sk-s...1234', openai_model: 'modelo-customizado' },
    }))
  })
})
