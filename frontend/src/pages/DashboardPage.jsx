import { useEffect, useMemo, useRef, useState } from 'react'
import { api, apiErrorMessage } from '../api/client'
import ResultFlow from '../components/ResultFlow'
import { useI18n } from '../i18n'
import { parseComparisonGroup, parseComparisonRun, parseProviders, parseRagQuery, parseStrategies, parseUploadedDocument } from '../types/contracts'

export default function DashboardPage() {
  const { t, locale } = useI18n()
  const [strategies, setStrategies] = useState([])
  const [providers, setProviders] = useState([])
  const [strategy, setStrategy] = useState('hybrid')
  const [provider, setProvider] = useState('ollama')
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState(null)
  const [compareResult, setCompareResult] = useState(null)
  const [compareStrategy, setCompareStrategy] = useState('vector')
  const [contentTypeFilter, setContentTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('indexed')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [semanticStatus, setSemanticStatus] = useState('idle')
  const [semanticGroup, setSemanticGroup] = useState(null)
  const [semanticError, setSemanticError] = useState('')
  const fileInputRef = useRef(null)

  const canRun = useMemo(() => question.trim().length > 0, [question])

  const loadBootstrap = async () => {
    const [strategiesResponse, providersResponse] = await Promise.all([
      api.get('/rag/strategies'),
      api.get('/providers'),
    ])
    setStrategies(parseStrategies(strategiesResponse.data))
    setProviders(parseProviders(providersResponse.data))
  }

  useEffect(() => {
    loadBootstrap().catch(() => setError(t('dashboardPage.loadError')))
  }, [])

  useEffect(() => {
    const configuredProvider = providers.find((item) => item.active)
    if (configuredProvider && configuredProvider.id !== provider) setProvider(configuredProvider.id)
  }, [providers, provider])

  const onUpload = async () => {
    if (!file || uploading) return
    setInfo('')
    setError('')
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post('/documents/upload', formData)
      const { filename, status } = parseUploadedDocument(response.data)
      const statusText = status ? ` (${status})` : ''
      setInfo(t('dashboardPage.uploadSuccess', { filename, status: statusText }))
      setFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      const detail = apiErrorMessage(err, '')
      setError(detail ? t('dashboardPage.uploadErrorDetail', { detail }) : t('dashboardPage.uploadErrorNoDetail'))
    } finally {
      setUploading(false)
    }
  }

  const runOne = async (selectedStrategy) => {
    const response = await api.post('/rag/query', {
      question,
      strategy: selectedStrategy,
      provider,
      locale,
      content_type_filter: contentTypeFilter || null,
      status_filter: statusFilter || null,
    })
    return parseRagQuery(response.data)
  }

  const runSemanticComparison = async (semanticStrategies) => {
    setSemanticStatus('loading')
    setSemanticGroup(null)
    setSemanticError('')
    try {
      const runResponse = await api.post('/comparisons', {
        question,
        strategies: semanticStrategies,
        provider,
        locale,
      })
      const groupId = parseComparisonRun(runResponse.data).comparison_group_id
      const groupResponse = await api.get(`/comparisons/${groupId}`)
      const group = parseComparisonGroup(groupResponse.data)
      setSemanticGroup(group)
      setSemanticStatus(group.status === 'partial_failed' ? 'partial' : 'done')
      setInfo(t('dashboardPage.semanticDone', { groupId }))
    } catch (err) {
      setSemanticStatus('failed')
      setSemanticError(apiErrorMessage(err, t('dashboardPage.semanticError')))
    }
  }

  const onRun = async () => {
    setError('')
    try {
      const main = await runOne(strategy)
      setResult(main)
    } catch (err) {
      setError(apiErrorMessage(err, t('dashboardPage.runError')))
    }
  }

  const onCompare = async () => {
    setError('')
    try {
      const primary = await runOne(strategy)
      const secondary = await runOne(compareStrategy)
      setResult(primary)
      setCompareResult(secondary)
      const summary = {
        primary_strategy: strategy,
        secondary_strategy: compareStrategy,
        primary_sources: primary.sources,
        secondary_sources: secondary.sources,
        primary_chunk_count: primary.chunks.length,
        secondary_chunk_count: secondary.chunks.length,
        primary_retrieval_ms: primary.metrics.retrieval_ms,
        secondary_retrieval_ms: secondary.metrics.retrieval_ms,
      }
      await api.post('/experiments', {
        question,
        primary_strategy: strategy,
        secondary_strategy: compareStrategy,
        provider,
        summary_json: JSON.stringify(summary),
      })
      const semanticStrategies = Array.from(new Set([strategy, compareStrategy]))
      await runSemanticComparison(semanticStrategies)
    } catch (err) {
      setError(apiErrorMessage(err, t('dashboardPage.compareError')))
    }
  }

  return (
    <div className="page-content">
      <header className="page-header">
        <div>
          <h1>{t('dashboardPage.title')}</h1>
          <p>{t('dashboardPage.subtitle')}</p>
        </div>
      </header>

      {info ? <div className="success-box">{info}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}

      <section className="grid two-col">
        <div className="card">
          <h2>{t('dashboardPage.mainConfig')}</h2>
          <label>{t('dashboardPage.primaryStrategy')}</label>
          <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            {strategies.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>

          <label>{t('dashboardPage.provider')}</label>
          <select value={provider} disabled>
            {providers.map((item) => <option key={item.id} value={item.id} disabled={item.can_use === false}>{item.label}{item.can_use === false ? ` — ${t('queryPage.providerNotConfigured')}` : ''}</option>)}
          </select>
          {providers.find((item) => item.id === provider)?.selected_model ? <p className="muted-line">{t('queryPage.activeModel', { model: providers.find((item) => item.id === provider).selected_model })}</p> : null}
          <p className="muted-line">{t('queryPage.providerGlobalHint')}</p>

          <label>{t('dashboardPage.contentTypeFilter')}</label>
          <select value={contentTypeFilter} onChange={(e) => setContentTypeFilter(e.target.value)}>
            <option value="">{t('dashboardPage.all')}</option>
            <option value="application/pdf">PDF</option>
            <option value="text/plain">TXT</option>
            <option value="text/markdown">Markdown</option>
          </select>

          <label>{t('dashboardPage.statusFilter')}</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">{t('dashboardPage.all')}</option>
            <option value="indexed">Indexed</option>
            <option value="uploaded">Uploaded</option>
          </select>

          <label>{t('dashboardPage.document')}</label>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={uploading} ref={fileInputRef} />
          <button type="button" onClick={onUpload} disabled={uploading}>
            {uploading ? t('dashboardPage.uploading') : t('dashboardPage.upload')}
          </button>
        </div>

        <div className="card">
          <h2>{t('dashboardPage.query')}</h2>
          <label>{t('dashboardPage.question')}</label>
          <textarea rows="8" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t('dashboardPage.questionPlaceholder')} />
          <button type="button" disabled={!canRun} onClick={onRun}>{t('dashboardPage.runPrimary')}</button>

          <label>{t('dashboardPage.compareStrategy')}</label>
          <select value={compareStrategy} onChange={(e) => setCompareStrategy(e.target.value)}>
            {strategies.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <button type="button" className="secondary-btn" disabled={!canRun} onClick={onCompare}>{t('dashboardPage.runCompare')}</button>
        </div>
      </section>

      <ResultFlow
        primary={result}
        secondary={compareResult}
        semanticGroup={semanticGroup}
        semanticStatus={semanticStatus}
        semanticError={semanticError}
      />
    </div>
  )
}
