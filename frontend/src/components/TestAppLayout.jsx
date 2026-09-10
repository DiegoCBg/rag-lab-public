import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useI18n } from '../i18n'
import AppNav from './AppNav'
import PrimaryRouteTabs from './PrimaryRouteTabs'
import SystemStatusBar from './SystemStatusBar'

export default function TestAppLayout() {
  const location = useLocation()
  const { t } = useI18n()
  const [authed, setAuthed] = useState(null)

  useEffect(() => {
    // Simular verificação de autenticação
    const token = window.localStorage.getItem('raglab_token')
    setAuthed(Boolean(token))
  }, [location.pathname])

  if (authed === null) {
    return <div className="app-loading" aria-busy="true">{t('common.loading')}</div>
  }
  
  if (!authed) {
    return <Navigate to="/login" replace />
  }
  
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">{t('a11y.skipToContent')}</a>
      <AppNav />
      <main id="main-content" className="app-main">
        <SystemStatusBar />
        <PrimaryRouteTabs />
        <Outlet />
      </main>
    </div>
  )
}
