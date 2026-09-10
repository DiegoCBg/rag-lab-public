import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { api, apiErrorMessage } from '../../api/client'
import { parseProviderTest, parseProviders, parseSettings } from '../../types/contracts'

const PROVIDER_ORDER = ['openai', 'anthropic', 'google', 'deepseek']

export default function ProvidersTab({ t, showSnack }) {
  const [items, setItems] = useState([])
  const [values, setValues] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [providersList, setProvidersList] = useState([])
  const [customModels, setCustomModels] = useState({})
  const [testResults, setTestResults] = useState({})
  const [dirtyProviders, setDirtyProviders] = useState({})

  useEffect(() => {
    Promise.all([
      api.get('/settings'),
      api.get('/providers'),
    ])
      .then(([sett, prov]) => {
        const settings = parseSettings(sett.data)
        setItems(settings.items || [])
        setProvidersList(parseProviders(prov.data))
        const initial = {}
        ;(settings.items || []).forEach((item) => { initial[item.key] = item.value })
        setValues(initial)
        const custom = {}
        parseProviders(prov.data).forEach((item) => {
          const model = initial[item.model_key] || item.selected_model || ''
          custom[item.id] = Boolean(model && !(item.models || []).some((option) => option.id === model))
        })
        setCustomModels(custom)
      })
      .catch((err) => setError(apiErrorMessage(err, t('settingsPage.providers.loadError'))))
  }, [])

  const saveSettings = async (payload) => {
    setBusy(true)
    setError('')
    try {
      const settings = parseSettings((await api.patch('/settings', { items: payload })).data)
      const byKey = {}
      settings.items.forEach((item) => { byKey[item.key] = item.value })
      setValues((prev) => ({ ...prev, ...byKey }))
      const providers = parseProviders((await api.get('/providers')).data)
      setProvidersList(providers)
      showSnack(t('settingsPage.providers.saved'))
      return true
    } catch (err) {
      setError(apiErrorMessage(err, t('settingsPage.providers.saveError')))
      return false
    } finally {
      setBusy(false)
    }
  }

  const saveKey = (key, value) => saveSettings({ [key]: value })

  const saveProvider = async (provider) => {
    const keyItem = items.find((item) => item.key === provider.api_key_key)
    const model = (values[provider.model_key] || '').trim()
    if (!keyItem || !model) return
    const saved = await saveSettings({
      [keyItem.key]: values[keyItem.key],
      [provider.model_key]: model,
    })
    if (saved) setDirtyProviders((prev) => ({ ...prev, [provider.id]: false }))
  }

  const testProvider = async (provider) => {
    setError('')
    setTestResults((prev) => ({ ...prev, [provider.id]: { pending: true } }))
    try {
      const result = parseProviderTest((await api.post(`/providers/${provider.id}/test`)).data)
      setTestResults((prev) => ({ ...prev, [provider.id]: result }))
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [provider.id]: { ok: false } }))
      setError(apiErrorMessage(err, t('settingsPage.providers.testError')))
    }
  }

  const externalProviders = useMemo(
    () => PROVIDER_ORDER.map((id) => providersList.find((item) => item.id === id)).filter(Boolean),
    [providersList],
  )

  return (
    <div>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>{t('settingsPage.providers.title')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{t('settingsPage.providers.subtitle')}</Typography>
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{t('settingsPage.providers.defaultsTitle')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('settingsPage.providers.defaultsHint')}</Typography>
          <Stack direction="row" spacing={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>{t('settingsPage.providers.defaultProvider')}</InputLabel>
              <Select label={t('settingsPage.providers.defaultProvider')} value={providersList.find((item) => item.active)?.id || values.default_chat_provider || 'ollama'} onChange={(e) => saveKey('default_chat_provider', e.target.value)} disabled={busy}>
                {providersList.map((item) => <MenuItem key={item.id} value={item.id} disabled={item.can_use === false}>{item.label}{item.can_use === false ? ` — ${t('queryPage.providerNotConfigured')}` : ''}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
        </CardContent>
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {externalProviders.map((provider) => {
          const keyItem = items.find((item) => item.key === provider.api_key_key)
          if (!keyItem) return null
          const test = testResults[provider.id]
          const model = values[provider.model_key] || provider.selected_model || ''
          const isCustom = customModels[provider.id] ?? !(provider.models || []).some((item) => item.id === model)
          return (
            <Card key={provider.id} variant="outlined">
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{provider.label}</Typography>
                  <Chip size="small" color={provider.configured ? 'success' : 'default'} label={provider.configured ? t('settingsPage.providers.configured') : t('settingsPage.providers.notConfigured')} />
                </Stack>
                <TextField label={t('settingsPage.providers.apiKey')} type="password" value={values[keyItem.key] || ''} onChange={(e) => { setValues({ ...values, [keyItem.key]: e.target.value }); setDirtyProviders((prev) => ({ ...prev, [provider.id]: true })); setTestResults((prev) => ({ ...prev, [provider.id]: null })) }} size="small" fullWidth disabled={busy} sx={{ mb: 1.5 }} />
                <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
                  <InputLabel>{t('settingsPage.providers.model')}</InputLabel>
                  <Select
                    label={t('settingsPage.providers.model')}
                    value={isCustom ? '__custom__' : model}
                    onChange={(event) => {
                      const selected = event.target.value
                      const custom = selected === '__custom__'
                      setCustomModels((prev) => ({ ...prev, [provider.id]: custom }))
                      setDirtyProviders((prev) => ({ ...prev, [provider.id]: true }))
                      setValues((prev) => ({ ...prev, [provider.model_key]: custom ? '' : selected }))
                      setTestResults((prev) => ({ ...prev, [provider.id]: null }))
                    }}
                    disabled={busy}
                  >
                    {(provider.models || []).map((option) => <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}
                    {provider.supports_custom_model ? <MenuItem value="__custom__">{t('settingsPage.providers.customModel')}</MenuItem> : null}
                  </Select>
                </FormControl>
                {isCustom ? <TextField label={t('settingsPage.providers.customModel')} value={model} onChange={(e) => { setValues((prev) => ({ ...prev, [provider.model_key]: e.target.value })); setDirtyProviders((prev) => ({ ...prev, [provider.id]: true })); setTestResults((prev) => ({ ...prev, [provider.id]: null })) }} size="small" fullWidth disabled={busy} sx={{ mb: 1.5 }} /> : null}
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                  {provider.supports_embeddings === false
                    ? t('settingsPage.providers.embeddingUnavailable')
                    : provider.can_use ? t('settingsPage.providers.ready') : t('settingsPage.providers.configureHint')}
                </Typography>
                {provider.embedding_model ? <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>{t('settingsPage.providers.embeddingModel', { model: provider.embedding_model })}</Typography> : null}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button variant="contained" onClick={() => saveProvider(provider)} disabled={busy || !(values[keyItem.key] || '').trim() || !model}>
                    {busy ? t('common.saving') : t('common.save')}
                  </Button>
                  <Button variant="outlined" onClick={() => testProvider(provider)} disabled={busy || !provider.can_use || dirtyProviders[provider.id]}>
                    {test?.pending ? t('settingsPage.providers.testing') : t('settingsPage.providers.test')}
                  </Button>
                </Stack>
                {test && !test.pending ? <Chip size="small" sx={{ mt: 1.5 }} color={test.ok ? 'success' : 'error'} label={test.ok ? t('settingsPage.providers.testOk', { model: test.model, ms: test.latency_ms }) : t('settingsPage.providers.testFail')} /> : null}
              </CardContent>
            </Card>
          )
        })}
      </Box>
    </div>
  )
}
