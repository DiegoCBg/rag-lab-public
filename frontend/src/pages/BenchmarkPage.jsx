import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../api/client'
import { useI18n } from '../i18n'
import { parseBenchmarkCompare, parseBenchmarkRun, parseProviders, parseStrategies } from '../types/contracts'
import { insertTabAtSelection } from '../utils/insertTabAtSelection'

function Bar({ value }) {
  if (value === null || value === undefined) return <span className="muted-line">—</span>
  const pct = Math.max(0, Math.min(100, value * 100))
  return (
    <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function BenchmarkPage() {
  const { t } = useI18n()
  const [provider, setProvider] = useState('ollama')
  const [strategy, setStrategy] = useState('vector')
  const [compareStrategy, setCompareStrategy] = useState('hybrid')
  const [contentTypeFilter, setContentTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('indexed')
  const [questions, setQuestions] = useState('')
  const [result, setResult] = useState(null)
  const [compareResult, setCompareResult] = useState(null)
  const [runMode, setRunMode] = useState(null)
  const [pendingMode, setPendingMode] = useState(null)
  const [error, setError] = useState('')

  const canRun = useMemo(() => questions.trim().length > 0, [questions])
  const { data: strategies = [], isLoading: strategiesLoading, isError: strategiesError } = useQuery({
    queryKey: ['benchmark-strategies'],
    queryFn: async () => parseStrategies((await api.get('/rag/strategies')).data),
  })
  const { data: providers = [], isLoading: providersLoading, isError: providersError } = useQuery({
    queryKey: ['benchmark-providers'],
    queryFn: async () => parseProviders((await api.get('/providers')).data),
  })

  const loadError = strategiesError || providersError ? t('benchmarkPage.loadError') : ''
  const optionsLoading = strategiesLoading || providersLoading

  const selectedProvider = providers.find((item) => item.id === provider)

  const buildItems = () =>
    questions
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [question, ...keywordParts] = line.split('\t')
        return {
          question: question.trim(),
          expected_keywords: keywordParts.join('\t').split(',').map((item) => item.trim()).filter(Boolean),
        }
      })
      .filter((item) => item.question)

  const benchmarkMutation = useMutation({
    mutationFn: async (mode) => {
      const items = buildItems()
      if (!items.length) return null
      let data
      if (mode === 'single') {
        const response = await api.post('/benchmark/run', {
          items,
          strategy,
          provider,
          content_type_filter: contentTypeFilter || null,
          status_filter: statusFilter || null,
        })
        data = parseBenchmarkRun(response.data)
      } else {
        const response = await api.post('/benchmark/compare', {
          items,
          primary_strategy: strategy,
          secondary_strategy: compareStrategy,
          provider,
          content_type_filter: contentTypeFilter || null,
          status_filter: statusFilter || null,
        })
        data = parseBenchmarkCompare(response.data)
      }

      let historyError = ''
      try {
        await api.post('/experiments', {
          question: items.map((item) => item.question).join('\n'),
          primary_strategy: mode === 'single' ? data.strategy : data.primary_strategy,
          secondary_strategy: mode === 'single' ? null : data.secondary_strategy,
          provider: data.provider || provider,
          summary_json: JSON.stringify({
            kind: 'benchmark',
            mode,
            items,
            content_type_filter: contentTypeFilter || null,
            status_filter: statusFilter || null,
            result: data,
          }),
        })
      } catch (err) {
        historyError = apiErrorMessage(err, t('benchmarkPage.historySaveError'))
      }

      return { mode, data, historyError }
    },
    onSuccess: (payload) => {
      if (!payload) return
      if (payload.mode === 'single') {
        setResult(payload.data)
        setCompareResult(null)
      } else {
        setCompareResult(payload.data)
        setResult(null)
      }
      setRunMode(payload.mode)
      setError(payload.historyError || '')
    },
    onError: (err) => setError(apiErrorMessage(err, t('benchmarkPage.runError'))),
    onSettled: () => setPendingMode(null),
  })

  const busy = benchmarkMutation.isPending

  useEffect(() => {
    const configuredProvider = providers.find((item) => item.active)
    if (configuredProvider && configuredProvider.id !== provider) setProvider(configuredProvider.id)
  }, [providers, provider])

  const runBenchmark = (mode) => {
    setError('')
    setRunMode(null)
    setPendingMode(mode)
    benchmarkMutation.mutate(mode)
  }

  const kpis = runMode === 'single' && result ? [
    { label: t('benchmarkPage.avgKeywordScore'), value: result.average_keyword_score?.toFixed(2) ?? '—' },
    { label: t('benchmarkPage.evaluatedItems'), value: `${result.evaluated_items}/${result.total_items}` },
  ] : runMode === 'compare' && compareResult ? [
    { label: t('benchmarkPage.strategyAvg', { strategy: compareResult.primary_strategy }), value: compareResult.primary_average?.toFixed(2) ?? '—' },
    { label: t('benchmarkPage.strategyAvg', { strategy: compareResult.secondary_strategy }), value: compareResult.secondary_average?.toFixed(2) ?? '—' },
    { label: t('benchmarkPage.winner'), value: compareResult.winner },
    { label: t('benchmarkPage.evaluatedItems'), value: `${compareResult.evaluated_items}/${compareResult.total_items}` },
  ] : []

  return (
    <div className="page-content benchmark-page" aria-busy={optionsLoading || busy}>
      <header className="page-header">
        <div>
<h1>{t('benchmarkPage.title')}</h1>
          <p>{t('benchmarkPage.subtitle')}</p>
        </div>
      </header>

      {loadError ? <div className="error-box">{loadError}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}
      {optionsLoading ? <div className="app-loading" role="status">{t('common.loading')}</div> : null}

      <section className="card">
        <div className="grid two-col">
          <div>
            <label>{t('benchmarkPage.provider')}</label>
            <select value={provider} disabled>
              {providers.map((item) => <option key={item.id} value={item.id} disabled={item.can_use === false}>{item.label}{item.can_use === false ? ` — ${t('queryPage.providerNotConfigured')}` : ''}</option>)}
            </select>
            {selectedProvider?.selected_model ? <p className="muted-line">{t('queryPage.activeModel', { model: selectedProvider.selected_model })}</p> : null}
            <p className="muted-line">{t('queryPage.providerGlobalHint')}</p>

            <label>{t('benchmarkPage.strategy')}</label>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
              {strategies.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>

            <label>{t('benchmarkPage.compareStrategy')}</label>
            <select value={compareStrategy} onChange={(e) => setCompareStrategy(e.target.value)}>
              {strategies.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
          <div>
<label>{t('benchmarkPage.contentTypeFilter')}</label>
            <select value={contentTypeFilter} onChange={(e) => setContentTypeFilter(e.target.value)}>
              <option value="">{t('benchmarkPage.all')}</option>
              <option value="application/pdf">PDF</option>
              <option value="text/plain">TXT</option>
              <option value="text/markdown">Markdown</option>
            </select>

<label>{t('benchmarkPage.statusFilter')}</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{t('benchmarkPage.all')}</option>
              <option value="indexed">Indexed</option>
              <option value="uploaded">Uploaded</option>
            </select>

<label>{t('benchmarkPage.questions')}</label>
            <p className="muted-line">{t('benchmarkPanel.formatHint')}</p>
            <textarea
              rows="6"
              value={questions}
              onChange={(e) => setQuestions(e.target.value)}
              onKeyDown={(event) => insertTabAtSelection(event, setQuestions)}
              placeholder={t('benchmarkPage.questionPlaceholder')}
            />
          </div>
        </div>
        <div className="row-gap">
          <button type="button" disabled={!canRun || busy} onClick={() => runBenchmark('single')}>
            {busy && pendingMode === 'single' ? t('benchmarkPage.running') : t('benchmarkPage.run')}
          </button>
          <button type="button" className="secondary-btn" disabled={!canRun || busy} onClick={() => runBenchmark('compare')}>
            {busy && pendingMode === 'compare' ? t('benchmarkPage.running') : t('benchmarkPage.compare')}
          </button>
        </div>
      </section>

      {kpis.length > 0 && (
        <section className="kpi-grid">
          {kpis.map((kpi) => (
            <div className="kpi-card card" key={kpi.label}>
              <span className="kpi-label">{kpi.label}</span>
              <span className="kpi-value">{kpi.value}</span>
            </div>
          ))}
        </section>
      )}

      {result && (
        <section className="card">
          <h2>{t('benchmarkPage.resultTitle', { strategy: result.strategy, provider: result.provider })}</h2>
          {result.warning ? <div className="warning-box">{result.warning}</div> : null}
          <table>
            <thead>
              <tr>
<th>{t('benchmarkPage.colQuestion')}</th>
                <th>{t('benchmarkPage.colAnswer')}</th>
                <th>{t('benchmarkPage.colSources')}</th>
                <th>{t('benchmarkPage.colKeywords')}</th>
                <th>Ratio</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((item, index) => (
                <tr key={index}>
                  <td>{item.question}</td>
                  <td>{item.answer_preview || '—'}</td>
                  <td>{(item.sources || []).length}</td>
                  <td>{item.keyword_hits}/{item.keyword_total}</td>
                  <td>{item.evaluated ? t('benchmarkPage.yes') : t('benchmarkPage.noKeywords')}</td>
                  <td><Bar value={item.score_ratio} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {compareResult && (
        <section className="card">
          <h2>{t('benchmarkPage.compareResultTitle', { primary: compareResult.primary_strategy, secondary: compareResult.secondary_strategy, provider: compareResult.provider })}</h2>
          {compareResult.warning ? <div className="warning-box">{compareResult.warning}</div> : null}
          <table>
            <thead>
              <tr>
<th>{t('benchmarkPage.colQuestion')}</th>
                <th>{t('benchmarkPage.colScoreStrategy', { strategy: compareResult.primary_strategy })}</th>
                <th>{t('benchmarkPage.colScoreStrategy', { strategy: compareResult.secondary_strategy })}</th>
                <th>{t('benchmarkPage.winner')}</th>
              </tr>
            </thead>
            <tbody>
              {compareResult.rows.map((row, index) => (
                <tr key={index}>
                  <td>{row.question}</td>
                  <td>{row.primary_score?.toFixed(2) ?? '—'}</td>
                  <td>{row.secondary_score?.toFixed(2) ?? '—'}</td>
                  <td>{row.winner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
