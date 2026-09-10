import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './features/auth/AuthContext'
import { useI18n } from './i18n'
import AppLayout from './components/AppLayout'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useThemeStore } from './store/theme'

const BenchmarkPage = lazy(() => import('./pages/BenchmarkPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ComparisonPage = lazy(() => import('./pages/ComparisonPage'))
const ComparisonsPage = lazy(() => import('./pages/ComparisonsPage'))
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const QueryPage = lazy(() => import('./pages/QueryPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const RunDetailPage = lazy(() => import('./pages/RunDetailPage'))
const ExecutionsPage = lazy(() => import('./pages/ExecutionsPage'))
const ExperimentsPage = lazy(() => import('./pages/ExperimentsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

// Rotas de autenticação (devem ter imagem de fundo full-screen)
const AUTH_ROUTES = ['/login', '/register', '/forgot-password']

function RouteFallback() {
  return <div className="app-loading" aria-busy="true">Carregando...</div>
}

export default function App() {
  const { isAuthenticated, isLoading } = useAuth()
  const [initialLoad, setInitialLoad] = useState(true)
  
  // Controla a classe no body para aplicar/remover a imagem de fundo full-screen
  // e força o tema claro nas páginas de autenticação
  useEffect(() => {
    if (isLoading) return
    const isAuthPage = AUTH_ROUTES.includes(window.location.pathname)
    document.body.classList.toggle('auth-view', isAuthPage)
    
    if (isAuthPage) {
      useThemeStore.getState().setMode('light')
    } else {
      // Restaura o tema original do usuário ao sair da página de auth
      const original = localStorage.getItem('raglab_theme_mode')
      if (original === 'dark' || original === 'light') {
        useThemeStore.getState().setMode(original)
      }
    }
    
    setInitialLoad(false)
    
    return () => {
      document.body.classList.remove('auth-view')
    }
  }, [isLoading, isAuthenticated, window.location.pathname])

  // Se estiver carregando, mostra uma tela de loading
  if (isLoading || initialLoad) {
    return <div className="app-loading" aria-busy="true">Carregando...</div>
  }

  // Verificar se está na página de login e mostrar diretamente
  if (window.location.pathname === '/login') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Rotas públicas */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        {/* Rotas protegidas */}
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/query" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/query" element={<QueryPage />} />
          <Route path="/comparison" element={<ComparisonPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/runs/:runId" element={<RunDetailPage />} />
          <Route path="/comparisons" element={<ComparisonsPage />} />
          <Route path="/executions" element={<ExecutionsPage />} />
          <Route path="/benchmark" element={<BenchmarkPage />} />
          <Route path="/experiments" element={<ExperimentsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* Catch-all: redireciona para login se não autenticado */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}
