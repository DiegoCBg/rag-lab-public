import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Button, MenuItem, Paper, Slider, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import { DataGrid } from '@mui/x-data-grid'
import { api, apiErrorMessage } from '../api/client'
import ChunkCard from '../components/ChunkCard'
import MetricsPanel from '../components/MetricsPanel'
import PipelineProgress from '../components/PipelineProgress'
import ResponseDiffViewer from '../components/ResponseDiffViewer'
import TraceViewer from '../components/TraceViewer'
import MarkdownContent from '../components/MarkdownContent'
import TokenUsagePanel from '../components/TokenUsagePanel'
import { useWorkspaceStore } from '../store/workspace'
import DocumentSelector, { useDocumentSelection, DocumentScopeDetails } from '../components/DocumentSelector'
import { useI18n } from '../i18n'
import { parseProviders, parseRagRun, parseStrategies } from '../types/contracts'

function buildExperimentSummary(data) {
  const primary = data?.results?.[0]
  const secondary = data?.results?.[1]
  return {
    run_id: data?.run_id || null,
    synthesis_status: data?.synthesis?.synthesis_status || null,
    synthesis_reason: data?.synthesis?.synthesis_reason || null,
    primary_execution_id: primary?.execution_id || null,
    secondary_execution_id: secondary?.execution_id || null,
    primary_sources: primary?.sources || [],
    secondary_sources: secondary?.sources || [],
    primary_chunk_count: primary?.chunks?.length ?? null,
    secondary_chunk_count: secondary?.chunks?.length ?? null,
    primary_retrieval_ms: primary?.metrics?.retrieval_ms ?? primary?.metrics?.retrievalMs ?? null,
    secondary_retrieval_ms: secondary?.metrics?.retrieval_ms ?? secondary?.metrics?.retrievalMs ?? null,
    primary_total_ms: primary?.metrics?.total_ms ?? primary?.metrics?.totalMs ?? null,
    secondary_total_ms: secondary?.metrics?.total_ms ?? secondary?.metrics?.totalMs ?? null,
  }
}

export default function ComparisonPage() {
  const store = useWorkspaceStore()
  const selection = useDocumentSelection()
  const { t, locale } = useI18n()
  const columns = [
    { field: 'rank', headerName: '#', width: 64 },
    { field: 'strategy', headerName: t('comparisonPage.columnStrategy'), width: 160 },
    { field: 'filename', headerName: t('comparisonPage.columnSourceDocument'), flex: 1, minWidth: 200 },
    { field: 'scoreLabel', headerName: t('comparisonPage.columnScore'), width: 110 },
  ]
  const [run, setRun] = useState(null)
  const [tab, setTab] = useState('summary')
  const [error, setError] = useState('')

  const { data: strategies = [] } = useQuery({ queryKey: ['strategies'], queryFn: async () => parseStrategies((await api.get('/rag/strategies')).data) })
  const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: async () => parseProviders((await api.get('/providers')).data) })

  useEffect(() => {
    if (strategies.length && !strategies.some((item) => item.id === store.compareStrategy)) store.setCompareStrategy(strategies[1]?.id || strategies[0].id)
    const configuredProvider = providers.find((item) => item.active)
    if (configuredProvider && configuredProvider.id !== store.provider) store.setProvider(configuredProvider.id)
  }, [strategies, providers])

  const mutation = useMutation({
    mutationFn: async () => parseRagRun((await api.post('/rag/runs', {
      mode: 'comparison',
      question: store.questionDraft,
      strategies: [store.strategy, store.compareStrategy].filter(Boolean),
      provider: store.provider,
      locale,
      top_k: store.topK,
      content_type_filter: store.contentTypeFilter || null,
      status_filter: store.statusFilter || null,
      ...selection.payload,
    })).data),
    onSuccess: async (data) => {
      setRun(data)
      setError('')
      setTab('summary')
      const primary = data?.results?.[0]
      const secondary = data?.results?.[1]
      if (!primary || !secondary) return
      try {
        await api.post('/experiments', {
          question: data.question || store.questionDraft,
          primary_strategy: primary.strategy || store.strategy,
          secondary_strategy: secondary.strategy || store.compareStrategy,
          provider: data.provider || store.provider,
          summary_json: JSON.stringify(buildExperimentSummary(data)),
        })
      } catch (err) {
        setError(apiErrorMessage(err, t('comparisonPage.errorRunComparison')))
      }
    },
    onError: (err) => setError(apiErrorMessage(err, t('comparisonPage.errorRunComparison'))),
  })

  const primary = run?.results?.[0]
  const secondary = run?.results?.[1]
  const highlightTerms = useMemo(
    () => store.questionDraft.split(/\s+/).map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, '')).filter((term) => term.length >= 3),
    [store.questionDraft]
  )
  const chunkRows = useMemo(() => (run?.results || []).flatMap((result) => (result.chunks || []).map((chunk, index) => ({
    id: `${result.strategy}-${chunk.chunkId || chunk.chunk_id || index}`,
    rank: chunk.rank,
    strategy: result.strategy,
    filename: chunk.filename,
    scoreLabel: chunk.score === null || chunk.score === undefined ? t('comparisonPage.noScore') : Number(chunk.score).toFixed(2),
    chunk,
  }))), [run])

  return (
    <div className="page-content comparison-page">
      <header className="page-header compact page-header-spread">
        <div>
            <Typography variant="h1" component="h1">
             {t('comparisonPage.title')}
            </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('comparisonPage.subtitle')}
          </Typography>
        </div>
      </header>

      {error ? <Alert severity="error" className="comparison-alert">{error}</Alert> : null}
      <DocumentSelector selection={selection} disabled={mutation.isPending} />
      {run && <DocumentScopeDetails scope={run.document_scope} />}

      {/* Toolbar Acrílica — Apple Glass */}
      <Paper
        className="surface-panel comparison-toolbar"
        elevation={0}
      >
        <TextField label={t('comparisonPage.questionLabel')} value={store.questionDraft} onChange={(event) => store.setQuestionDraft(event.target.value)} className="comparison-question" />
        <TextField select label={t('comparisonPage.strategyALabel')} value={store.strategy} onChange={(event) => store.setStrategy(event.target.value)}>
          {strategies.map((item) => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}
        </TextField>
        <TextField select label={t('comparisonPage.strategyBLabel')} value={store.compareStrategy} onChange={(event) => store.setCompareStrategy(event.target.value)}>
          {strategies.map((item) => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}
        </TextField>
        <TextField select label={t('comparisonPage.providerLabel')} value={store.provider} disabled>
          {providers.map((item) => <MenuItem key={item.id} value={item.id} disabled={item.can_use === false}>{item.label}{item.can_use === false ? ` — ${t('queryPage.providerNotConfigured')}` : ''}</MenuItem>)}
        </TextField>
        {providers.find((item) => item.id === store.provider)?.selected_model ? <Typography variant="caption" color="text.secondary">{t('queryPage.activeModel', { model: providers.find((item) => item.id === store.provider).selected_model })}</Typography> : null}
        <Typography variant="caption" color="text.secondary">{t('queryPage.providerGlobalHint')}</Typography>
        <div className="comparison-topk-control">
          <Typography variant="caption" className="comparison-topk-label">{t('queryPage.topK')}</Typography>
          <Slider
            aria-label={t('queryPage.topK')}
            value={store.topK}
            min={1}
            max={50}
            step={1}
            disabled={mutation.isPending}
            onChange={(_, value) => store.setTopK(value)}
            size="small"
          />
          <strong>{store.topK}</strong>
        </div>
        <Button
          variant="contained"
          startIcon={<CompareArrowsIcon />}
          disabled={!selection.valid || !store.questionDraft.trim() || mutation.isPending || store.strategy === store.compareStrategy}
          onClick={() => mutation.mutate()}
          className="comparison-primary-action"
        >
          {mutation.isPending ? t('comparisonPage.executing') : t('comparisonPage.compare')}
        </Button>
      </Paper>

      <PipelineProgress activeStage={run?.active_stage || (mutation.isPending ? 'semantic_analysis' : 'queued')} events={run?.events || []} loading={mutation.isPending} />

      {primary ? <MetricsPanel primary={primary.metrics} secondary={secondary?.metrics || null} loading={mutation.isPending} density="compact" /> : null}

      {run ? (
        <Paper
          className="surface-panel comparison-results"
          elevation={0}
        >
          <Tabs value={tab} onChange={(_, value) => setTab(value)} className="local-tabs">
            <Tab value="summary" label={t('comparisonPage.tabSummary')} className="local-tab" />
            <Tab value="chunks" label={t('comparisonPage.tabChunks')} className="local-tab" />
            <Tab value="trace" label={t('comparisonPage.tabTrace')} className="local-tab" />
            <Tab value="diff" label={t('comparisonPage.tabDiff')} className="local-tab" />
            <Tab value="audit" label={t('comparisonPage.tabAudit')} className="local-tab" />
          </Tabs>

          {tab === 'summary' ? (
            <div className="comparison-answer-grid">
              <TokenUsagePanel usage={run.synthesis?.token_usage} />
              {[primary, secondary].filter(Boolean).map((result) => (
                <Paper className="answer-pane comparison-answer-pane" elevation={0} key={result.strategy}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} className="comparison-answer-head">
                    <Typography variant="h6" className="comparison-answer-title">{result.strategy}</Typography>
                    <Typography variant="caption" color="text.secondary">ID: {result.execution_id}</Typography>
                  </Stack>
                  <div className="answer-text"><MarkdownContent>{result.answer}</MarkdownContent></div>
                </Paper>
              ))}
              <Paper className="synthesis-pane comparison-synthesis-pane" elevation={0}>
                <Typography variant="h6" className="comparison-synthesis-title">
                  <AutoAwesomeIcon /> {t('comparisonPage.synthesisTitle')}
                </Typography>
                <div className="answer-text">
                  <MarkdownContent>{run.synthesis?.combined_synthesis || run.synthesis?.synthesis_reason || t('comparisonPage.noSynthesis')}</MarkdownContent>
                </div>
              </Paper>
            </div>
          ) : null}

          {tab === 'chunks' ? (
            <div className="chunks-view">
              <div className="chunk-data-grid chunk-data-grid--spaced">
                <DataGrid rows={chunkRows} columns={columns} density="compact" pageSizeOptions={[25, 50, 100]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} disableRowSelectionOnClick />
              </div>
              <div className="chunk-list">
                {chunkRows.slice(0, 50).map((row) => <ChunkCard key={row.id} chunk={{ ...row.chunk, rank: row.rank }} density="compact" highlightTerms={highlightTerms} />)}
              </div>
            </div>
          ) : null}

          {tab === 'trace' ? (
            <TraceViewer events={run.events} connectorWidth={2} />
          ) : null}

          {tab === 'diff' ? <ResponseDiffViewer left={primary?.answer || ''} right={secondary?.answer || ''} /> : null}

          {tab === 'audit' ? (
            <pre className="metadata-block metadata-block--inverse comparison-audit-block">
              {JSON.stringify(run, null, 2)}
            </pre>
          ) : null}
        </Paper>
      ) : null}
    </div>
  )
}
