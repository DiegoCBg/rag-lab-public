import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Button, Chip, CircularProgress, MenuItem, Slider, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import HelpIcon from '@mui/icons-material/Help'
import { api, apiErrorMessage } from '../api/client'
import ChunkCard from '../components/ChunkCard'
import MarkdownContent from '../components/MarkdownContent'
import TokenUsagePanel from '../components/TokenUsagePanel'
import DocumentSelector, { useDocumentSelection, DocumentScopeDetails } from '../components/DocumentSelector'
import MetricsPanel from '../components/MetricsPanel'
import PipelineProgress from '../components/PipelineProgress'
import TraceViewer from '../components/TraceViewer'
import { useWorkspaceStore } from '../store/workspace'
import { useI18n } from '../i18n'
import { parseProviders, parseRagRun, parseStrategies, parseSystemStatus } from '../types/contracts'
import { buildRagAnswerDisplay } from '../utils/ragAnswer'

export default function QueryPage() {
  const store = useWorkspaceStore()
  const selection = useDocumentSelection()
  const { t, locale } = useI18n()
  const [run, setRun] = useState(null)
  const [error, setError] = useState('')
  const [questionError, setQuestionError] = useState('')
  const [showMoreSuggestions, setShowMoreSuggestions] = useState(false)
  const [viewMode, setViewMode] = useState('content') // 'content' | 'telemetry'

  const questionSuggestions = [
    t('queryPage.suggestionSummary'),
    t('queryPage.suggestionRisks'),
    t('queryPage.suggestionEvidence'),
  ]
  const additionalQuestionSuggestions = [
    t('queryPage.suggestionContradictions'),
    t('queryPage.suggestionChronology'),
    t('queryPage.suggestionRelations'),
    t('queryPage.suggestionGaps'),
  ]
  const visibleQuestionSuggestions = showMoreSuggestions
    ? [...questionSuggestions, ...additionalQuestionSuggestions]
    : questionSuggestions

  const { data: strategies = [] } = useQuery({ queryKey: ['strategies'], queryFn: async () => parseStrategies((await api.get('/rag/strategies')).data) })
  const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: async () => parseProviders((await api.get('/providers')).data) })
  const { data: systemStatus } = useQuery({
    queryKey: ['system-status'],
    queryFn: async () => parseSystemStatus((await api.get('/system/status')).data),
    retry: false,
  })
  const indexedDocumentCount = systemStatus?.documents?.indexed ?? '—'
  const selectedStrategyLabel = strategies.find((item) => item.id === store.strategy)?.label || store.strategy || t('queryPage.loadingOption')

  useEffect(() => {
    if (strategies.length && !strategies.some((item) => item.id === store.strategy)) store.setStrategy(strategies[0].id)
    const configuredProvider = providers.find((item) => item.active)
    if (configuredProvider && configuredProvider.id !== store.provider) store.setProvider(configuredProvider.id)
  }, [strategies, providers])

  const mutation = useMutation({
    mutationFn: async () => parseRagRun((await api.post('/rag/runs', {
      mode: 'single',
      question: store.questionDraft,
      strategies: [store.strategy],
      provider: store.provider,
      locale,
      top_k: store.topK,
      content_type_filter: store.contentTypeFilter || null,
      status_filter: store.statusFilter || null,
      ...selection.payload,
    })).data),
    onSuccess: (data) => { setRun(data); setError('') },
    onError: (err) => setError(apiErrorMessage(err, t('queryPage.runError'))),
  })

  const result = run?.results?.[0]
  const highlightTerms = useMemo(
    () => store.questionDraft.split(/\s+/).map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, '')).filter((term) => term.length >= 3),
    [store.questionDraft]
  )

  const handleQuestionChange = (event) => {
    const value = event.target.value
    store.setQuestionDraft(value)
    if (value.trim()) setQuestionError('')
  }

  const handleRun = () => {
    if (mutation.isPending || !selection.valid) return
    if (!store.questionDraft.trim()) {
      setQuestionError(t('queryPage.questionRequired'))
      return
    }
    setQuestionError('')
    mutation.mutate()
  }

  return (
    <div className="page-content query-page" aria-busy={mutation.isPending}>
      <header className="page-header compact">
        <div>
             <Typography variant="h1" component="h1">{t('queryPage.title')}</Typography>
          <p>{t('queryPage.subtitle')}</p>
        </div>
      </header>

      {error ? <Alert severity="error" className="industrial-error">{error}</Alert> : null}
      <DocumentSelector selection={selection} disabled={mutation.isPending} />
      {run && <DocumentScopeDetails scope={run.document_scope} />}

      <section className="query-workspace-grid">
        <div className="query-hero surface-panel">
          <span className="query-hero-label">
            {t('queryPage.questionLabel')}
            <Tooltip title={t('queryPage.questionTooltip')}>
              <HelpIcon fontSize="small" sx={{ cursor: 'help', opacity: 0.6, '&:hover': { opacity: 1 } }} />
            </Tooltip>
          </span>
          <p className="query-scope-line">
            {t('queryPage.scope', { count: indexedDocumentCount })}
          </p>
          <div className="query-suggestions" aria-label={t('queryPage.suggestionsLabel')}>
            {visibleQuestionSuggestions.map((suggestion) => (
              <Chip
                key={suggestion}
                label={suggestion}
                size="small"
                variant="outlined"
                clickable
                onClick={() => {
                  store.setQuestionDraft(suggestion)
                  setQuestionError('')
                }}
              />
            ))}
          </div>
          <div className="query-suggestions-footer">
            <Button
              className="query-suggestions-toggle"
              variant="text"
              size="small"
              endIcon={showMoreSuggestions ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              aria-expanded={showMoreSuggestions}
              onClick={() => setShowMoreSuggestions((value) => !value)}
            >
              {showMoreSuggestions ? t('queryPage.fewerSuggestions') : t('queryPage.moreSuggestions')}
            </Button>
          </div>
          <TextField
            multiline
            minRows={4}
            maxRows={10}
            value={store.questionDraft}
            onChange={handleQuestionChange}
            placeholder={t('queryPage.questionPlaceholder')}
            className="query-hero-input"
            error={Boolean(questionError)}
            helperText={questionError || undefined}
          />
          <p className="query-execution-summary">
            {t('queryPage.executionSummary', { strategy: selectedStrategyLabel, topK: store.topK })}
          </p>
          <div className="query-hero-actions">
            <Button
              className="query-run-btn"
              startIcon={mutation.isPending ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
              onClick={handleRun}
              disabled={mutation.isPending || !selection.valid}
            >
              {mutation.isPending ? t('queryPage.running') : t('queryPage.run')}
            </Button>
            <span className="query-hero-hint">{t('queryPage.activeStrategy')}: <strong>{selectedStrategyLabel}</strong></span>
          </div>
          <PipelineProgress activeStage={run?.active_stage || (mutation.isPending ? 'retrieval' : 'queued')} events={run?.events || []} loading={mutation.isPending} />
        </div>

        <aside className="query-config query-configuration surface-panel">
          <h2 className="query-config-title">
            {t('queryPage.configuration')}
            <Tooltip title={t('queryPage.configurationTooltip')}>
              <HelpIcon fontSize="small" sx={{ cursor: 'help', opacity: 0.6, '&:hover': { opacity: 1 } }} />
            </Tooltip>
          </h2>
          <div className="config-field">
            <label className="config-field-label config-field-label--with-help" htmlFor="strategy-select">
              <span>{t('queryPage.strategy')}</span>
              <Tooltip title={t('queryPage.strategyTooltip')}>
                <HelpIcon fontSize="small" aria-label={t('queryPage.strategyTooltip')} />
              </Tooltip>
            </label>
            <TextField
              id="strategy-select"
              select
              size="small"
              value={strategies.some((item) => item.id === store.strategy) ? store.strategy : ''}
              onChange={(event) => store.setStrategy(event.target.value)}
              slotProps={{
                select: {
                  displayEmpty: true,
                  renderValue: (value) => strategies.find((item) => item.id === value)?.label || value || t('queryPage.loadingOption'),
                },
              }}
            >
              {strategies.map((item) => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}
            </TextField>
          </div>
          <div className="config-field">
            <label className="config-field-label config-field-label--with-help" htmlFor="provider-select">
              <span>{t('queryPage.provider')}</span>
              <Tooltip title={t('queryPage.providerTooltip')}>
                <HelpIcon fontSize="small" aria-label={t('queryPage.providerTooltip')} />
              </Tooltip>
            </label>
            <TextField
              id="provider-select"
              select
              size="small"
              value={providers.some((item) => item.id === store.provider) ? store.provider : ''}
              disabled
              slotProps={{
                select: {
                  displayEmpty: true,
                  renderValue: (value) => providers.find((item) => item.id === value)?.label || value || t('queryPage.loadingOption'),
                },
              }}
            >
              {providers.map((item) => <MenuItem key={item.id} value={item.id} disabled={item.can_use === false}>{item.label}{item.can_use === false ? ` — ${t('queryPage.providerNotConfigured')}` : ''}</MenuItem>)}
            </TextField>
            {providers.find((item) => item.id === store.provider)?.selected_model ? <span className="config-field-hint">{t('queryPage.activeModel', { model: providers.find((item) => item.id === store.provider).selected_model })}</span> : null}
            <span className="config-field-hint">{t('queryPage.providerGlobalHint')}</span>
          </div>
          <div className="config-field">
            <span className="config-field-label">{t('queryPage.topK')}</span>
            <div className="topk-row">
              <Slider value={store.topK} min={1} max={50} step={1} onChange={(_, value) => store.setTopK(value)} />
              <span className="topk-value">{store.topK}</span>
            </div>
          </div>
          <div className="config-field">
            <label className="config-field-label" htmlFor="content-type-select">{t('queryPage.contentType')}</label>
            <TextField
              id="content-type-select"
              select
              size="small"
              value={store.contentTypeFilter || ''}
              onChange={(event) => store.setContentTypeFilter(event.target.value || null)}
              slotProps={{ select: { displayEmpty: true, renderValue: (value) => value || t('queryPage.allTypes') } }}
            >
              <MenuItem value="">{t('queryPage.allTypes')}</MenuItem>
              <MenuItem value="application/pdf">PDF</MenuItem>
              <MenuItem value="text/plain">TXT</MenuItem>
              <MenuItem value="text/markdown">Markdown</MenuItem>
            </TextField>
          </div>
          <div className="config-field">
            <label className="config-field-label" htmlFor="status-select">{t('queryPage.indexStatus')}</label>
            <TextField
              id="status-select"
              select
              size="small"
              value={store.statusFilter || ''}
              onChange={(event) => store.setStatusFilter(event.target.value || null)}
              slotProps={{ select: { displayEmpty: true, renderValue: (value) => value || t('queryPage.allStatuses') } }}
            >
              <MenuItem value="">{t('queryPage.allStatuses')}</MenuItem>
              <MenuItem value="indexed">{t('queryPage.statusIndexed')}</MenuItem>
              <MenuItem value="uploaded">{t('queryPage.statusUploaded')}</MenuItem>
              <MenuItem value="processing">{t('queryPage.statusProcessing')}</MenuItem>
              <MenuItem value="failed">{t('queryPage.statusFailed')}</MenuItem>
            </TextField>
          </div>
        </aside>
      </section>

      {mutation.isPending ? (
        <section className="result-stack query-pending-results" aria-live="polite">
          <div className="result-card surface-panel result-card--glass">
            <h2 className="result-card-title">{t('queryPage.systemAnswer')}</h2>
            <div className="query-skeleton">
              <span className="query-skeleton-line" />
              <span className="query-skeleton-line" />
              <span className="query-skeleton-line short" />
            </div>
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="result-stack">
          <div className="result-stack-header">
            <Tabs value={viewMode} onChange={(_, val) => setViewMode(val)}>
              <Tab value="content" label={t('queryPage.tabContent')} />
              <Tab value="telemetry" label={t('queryPage.tabTelemetry')} />
            </Tabs>
          </div>

          {viewMode === 'content' ? (
            <>
              <div className="result-card surface-panel result-card--glass">
                <h2 className="result-card-title">{t('queryPage.systemAnswer')}</h2>
                <div className="answer-text"><MarkdownContent>{buildRagAnswerDisplay(result)}</MarkdownContent></div>
              </div>
              <TokenUsagePanel usage={result.token_usage} />

              <div className="result-card surface-panel">
                <h2 className="result-card-title result-card-title--neutral">{t('queryPage.sourcesTitle')}</h2>
                <div className="result-chunk-list">
                  {result.chunks.map((chunk) => <ChunkCard key={chunk.chunkId || chunk.chunk_id} chunk={chunk} density="compact" highlightTerms={highlightTerms} />)}
                </div>
              </div>
            </>
          ) : (
            <>
              <MetricsPanel primary={result.metrics} loading={mutation.isPending} density="compact" />
              <div className="result-card surface-panel">
                <h2 className="result-card-title result-card-title--neutral">{t('queryPage.traceTitle')}</h2>
                <TraceViewer events={run.events} connectorWidth={2} />
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  )
}
