import React from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@mui/material/styles'
import { darkTheme } from '../theme'
import { I18nProvider } from '../i18n'
import DocumentsPage from '../pages/DocumentsPage'
import ExecutionsPage from '../pages/ExecutionsPage'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

test('smoke: DocumentsPage renders', () => {
  render(
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={darkTheme}>
        <MemoryRouter>
          <I18nProvider>
            <DocumentsPage />
          </I18nProvider>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
})

test('smoke: ExecutionsPage renders', () => {
  render(
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={darkTheme}>
        <MemoryRouter>
          <I18nProvider>
            <ExecutionsPage />
          </I18nProvider>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
})