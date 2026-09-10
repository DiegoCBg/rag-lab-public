import { useEffect, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Paper, Stack, TextField, Typography } from '@mui/material'
import { api, apiErrorMessage } from '../../api/client'
import { parseOllamaModels, parseOllamaTest, parseSettings } from '../../types/contracts'

export default function OllamaTab({ t, showSnack }) {
  const [models, setModels] = useState([])
  const [baseUrl, setBaseUrl] = useState('')
  const [current, setCurrent] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const response = await api.get('/ollama/models')
      const payload = parseOllamaModels(response.data)
      setModels(payload.models || [])
      setCurrent(payload.current || '')
      setBaseUrl(payload.base_url || '')
    } catch (err) {
      setError(apiErrorMessage(err, t('settingsPage.ollama.loadError')))
    }
  }

  useEffect(() => { load() }, [])

  const onTest = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await api.post('/ollama/test')
      setTestResult(parseOllamaTest(response.data))
    } catch (err) {
      setError(apiErrorMessage(err, t('settingsPage.ollama.testError')))
    } finally {
      setBusy(false)
    }
  }

  const onSelectModel = async (model) => {
    setBusy(true)
    setError('')
    try {
      parseSettings((await api.patch('/settings', { items: { ollama_model: model } })).data)
      setCurrent(model)
      showSnack(t('settingsPage.ollama.savedModel'))
    } catch (err) {
      setError(apiErrorMessage(err, t('settingsPage.ollama.saveError')))
    } finally {
      setBusy(false)
    }
  }

  const formatSize = (bytes) => {
    if (!bytes) return '-'
    const gb = bytes / (1024 ** 3)
    return `${gb.toFixed(1)} GB`
  }

  return (
    <div>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>{t('settingsPage.ollama.title')}</Typography>
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField label={t('settingsPage.ollama.baseUrl')} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} size="small" sx={{ flex: 1 }} />
            <Button variant="outlined" onClick={onTest} disabled={busy}>{t('settingsPage.ollama.test')}</Button>
          </Stack>
          {testResult ? (
            <Box sx={{ mt: 2 }}>
              <Chip
                size="small"
                color={testResult.ok ? 'success' : 'error'}
                label={testResult.ok
                  ? t('settingsPage.ollama.testOk', { ms: testResult.latency_ms })
                  : t('settingsPage.ollama.testFail', { code: testResult.status_code })}
              />
            </Box>
          ) : null}
        </CardContent>
      </Card>

      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        {t('settingsPage.ollama.installedModels')} {current ? `- ${t('settingsPage.ollama.currentModel', { model: current })}` : ''}
      </Typography>
      {models.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 3, textAlign: 'center', color: 'var(--ui-muted)' }}>{t('settingsPage.ollama.noModels')}</Paper>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2 }}>
          {models.map((model) => {
            const inUse = model.name === current
            return (
              <Card key={model.name} variant="outlined" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>{model.name}</Typography>
                  {inUse ? <Chip size="small" color="success" label={t('settingsPage.ollama.inUse')} /> : null}
                </Box>
                <Typography variant="body2" color="text.secondary">{formatSize(model.size)}</Typography>
                <Box sx={{ mt: 'auto' }}>
                  <Button size="small" fullWidth variant={inUse ? 'contained' : 'outlined'} disabled={inUse} onClick={() => onSelectModel(model.name)}>
                    {inUse ? t('settingsPage.ollama.inUse') : t('settingsPage.ollama.use')}
                  </Button>
                </Box>
              </Card>
            )
          })}
        </Box>
      )}
    </div>
  )
}
