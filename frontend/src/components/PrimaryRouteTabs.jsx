import { Tab, Tabs } from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'

export default function PrimaryRouteTabs() {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useI18n()

  const tabs = [
    { label: t('primaryTabs.query'), route: '/query' },
    { label: t('primaryTabs.comparison'), route: '/comparison' },
    { label: t('primaryTabs.documents'), route: '/documents' },
  ]

  const active = tabs.find((tab) => location.pathname === tab.route)?.route || false

  if (!active) return null

  return (
    <div className="primary-tabs">
      <Tabs
        value={active}
        onChange={(_, value) => navigate(value)}
        variant="scrollable"
        scrollButtons="auto"
      >
        {tabs.map((tab) => (
          <Tab
            key={tab.route}
            label={tab.label}
            value={tab.route}
            className={`primary-route-tab ${location.pathname === tab.route ? 'active' : 'inactive'}`}
          />
        ))}
      </Tabs>
    </div>
  )
}
