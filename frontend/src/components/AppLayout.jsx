import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { useI18n } from '../i18n'
import AppNav from './AppNav'
import SystemStatusBar from './SystemStatusBar'

export default function AppLayout() {
  const location = useLocation()
  const { isAuthenticated, isLoading } = useAuth()
  const { t } = useI18n()

  if (isLoading) {
    return <div className="app-loading" aria-busy="true">{t('common.loading')}</div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">{t('a11y.skipToContent')}</a>
      <AppNav />
      <main id="main-content" className="app-main">
        <SystemStatusBar />
        <Outlet />
      </main>
    </div>
  )
}
