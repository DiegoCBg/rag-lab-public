import { useState } from 'react'
import { Box, Paper, Snackbar, Tab, Tabs, Typography } from '@mui/material'
import { useI18n } from '../i18n'
import UsersTab from './settings/UsersTab'
import OllamaTab from './settings/OllamaTab'
import ProvidersTab from './settings/ProvidersTab'
import PreferencesTab from './settings/PreferencesTab'

function TabPanel({ value, index, children }) {
  if (value !== index) return null
  return <Box sx={{ pt: 3 }}>{children}</Box>
}

export default function SettingsPage() {
  const { t } = useI18n()
  const [tab, setTab] = useState(0)
  const [snack, setSnack] = useState('')

  const showSnack = (message) => setSnack(message)

  const tabs = [
    { label: t('settingsPage.tab.users') },
    { label: t('settingsPage.tab.ollama') },
    { label: t('settingsPage.tab.providers') },
    { label: t('settingsPage.tab.preferences') },
  ]

  return (
    <div className="page-content settings-page">
      <header className="page-header compact">
        <div>
          <Typography variant="h1" component="h1" className="settings-page-title">{t('settingsPage.title')}</Typography>
          <p>{t('settingsPage.subtitle')}</p>
        </div>
      </header>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto">
          {tabs.map((item) => <Tab key={item.label} label={item.label} />)}
        </Tabs>

        <TabPanel value={tab} index={0}><UsersTab t={t} showSnack={showSnack} /></TabPanel>
        <TabPanel value={tab} index={1}><OllamaTab t={t} showSnack={showSnack} /></TabPanel>
        <TabPanel value={tab} index={2}><ProvidersTab t={t} showSnack={showSnack} /></TabPanel>
        <TabPanel value={tab} index={3}><PreferencesTab t={t} /></TabPanel>
      </Paper>

      <Snackbar open={Boolean(snack)} autoHideDuration={3000} onClose={() => setSnack('')} message={snack} />
    </div>
  )
}
