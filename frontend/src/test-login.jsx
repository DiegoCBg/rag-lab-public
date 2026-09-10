// Teste direto para verificar se o login está funcionando
import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './features/auth/AuthContext'
import { I18nProvider } from './i18n'
import { darkTheme, lightTheme } from './theme'
import { ThemeProvider } from '@mui/material'

// Simular navegação direta para a página de login
const TestApp = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <I18nProvider>
          <ThemeProvider theme={lightTheme}>
            <App />
          </ThemeProvider>
        </I18nProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

// Renderizar o teste
const root = createRoot(document.getElementById('root'))
root.render(<TestApp />)