import { Avatar, Button, IconButton, Tooltip, Typography } from '@mui/material'
import LogoutIcon from '@mui/icons-material/Logout'
import QueryBuilderIcon from '@mui/icons-material/QueryBuilder'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import BarChartIcon from '@mui/icons-material/BarChart'
import ScienceIcon from '@mui/icons-material/Science'
import FolderIcon from '@mui/icons-material/Folder'
import DashboardIcon from '@mui/icons-material/Dashboard'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import SettingsIcon from '@mui/icons-material/Settings'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LanguageIcon from '@mui/icons-material/Language'
import { NavLink, useNavigate } from 'react-router-dom'
import { useI18n, LOCALES } from '../i18n'
import { useThemeStore } from '../store/theme'
import { useAuth } from '../features/auth/AuthContext'
export default function AppNav() {
  const navigate = useNavigate()
  const { username: authUser, logout } = useAuth()
  const { t, locale, setLocale } = useI18n()
  const mode = useThemeStore((state) => state.mode)
  const toggleMode = useThemeStore((state) => state.toggleMode)
  const username = authUser || t('nav.defaultUser')
  const NAV_SECTIONS = [
    {
      title: t('nav.section.workspace'),
      items: [
        { to: '/query', label: t('nav.query'), icon: <QueryBuilderIcon />, badge: t('nav.badge.main') },
        { to: '/documents', label: t('nav.documents'), icon: <FolderIcon /> },
      ],
    },
    {
      title: t('nav.section.analysis'),
      items: [
        { to: '/comparisons', label: t('nav.comparisons'), icon: <BarChartIcon />, badge: t('nav.badge.ai') },
        { to: '/executions', label: t('nav.executions'), icon: <CompareArrowsIcon /> },
      ],
    },
    {
      title: t('nav.section.lab'),
      items: [
        { to: '/benchmark', label: t('nav.benchmark'), icon: <ScienceIcon /> },
        { to: '/experiments', label: t('nav.experiments'), icon: <DashboardIcon /> },
      ],
    },
    {
      title: t('nav.section.admin'),
       items: [
         { to: '/settings', label: t('nav.settings'), icon: <SettingsIcon /> },
         { to: '#', label: t('nav.logoutLabel'), icon: <LogoutIcon />, isLogout: true },
       ],
    },
  ]
  const onLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }
  const nextLocale = locale === 'pt-BR' ? 'en' : 'pt-BR'
  return (
    <aside className="app-sidebar">
      {/* Brand Header — Apple Glass style */}
      <div className="brand">
        <div className="brand-badge brand-badge--plain">
          <img src="/logo.png?v=2" alt="RAG Lab Protótipo" className="brand-logo" />
        </div>
       </div>
      {/* Navegação principal */}
      <nav className="side-nav" aria-label={t('nav.aria')}>
        {Object.values(NAV_SECTIONS).map((section) => (
          <div key={section.title} className="nav-section">
            <span className="nav-section-title">
              {section.title}
            </span>
            {section.items.map((item) => (
               <NavLink
                 key={item.to}
                 to={item.to}
                 className={({ isActive }) => [
                   'side-link',
                   isActive ? 'active' : '',
                   item.isLogout ? 'nav-logout-link' : '',
                 ].filter(Boolean).join(' ')}
                 data-testid="nav-item"
                 aria-label={item.label}
                 onClick={(e) => {
                   if (item.isLogout) {
                     e.preventDefault()
                     onLogout()
                   }
                 }}
               >
                <span className="side-icon">{item.icon}</span>
                <span className="side-label">{item.label}</span>
                 {item.badge ? (
                   <span
                     className={
                       `side-badge ${item.badge === t('nav.badge.main') ? 'side-badge--accent' : 'side-badge--soft'}`
                     }
                   >
                     {item.badge}
                   </span>
                 ) : null}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      {/* Preferências rápidas: idioma + tema */}
      <div className="sidebar-footer">
        <div className="sidebar-actions">
          <Button size="small" variant="outlined" onClick={() => setLocale(nextLocale)} startIcon={<LanguageIcon />} className="sidebar-action-grow">
            {LOCALES[nextLocale].label}
          </Button>
          <Tooltip title={mode === 'dark' ? t('nav.theme.light') : t('nav.theme.dark')}>
            <Button size="small" variant="outlined" onClick={toggleMode} aria-label={mode === 'dark' ? t('nav.theme.light') : t('nav.theme.dark')} className="sidebar-icon-button">
              {mode === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </Button>
          </Tooltip>
        </div>
        {/* Footer de perfil */}
        <div className="sidebar-profile-card">
          <div className="sidebar-profile-main">
            <Avatar className="sidebar-avatar">
              {username.charAt(0).toUpperCase()}
            </Avatar>
            <div className="sidebar-user-copy">
              <Typography className="sidebar-username">
                {username}
              </Typography>
              <Typography className="sidebar-session-label">
                {t('nav.activeSession')}
              </Typography>
            </div>
          </div>
          <Tooltip title={t('nav.logout')}>
            <IconButton size="small" onClick={onLogout} aria-label={t('nav.logout')} className="sidebar-logout-button">
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </div>
      </div>
    </aside>
  )
}
