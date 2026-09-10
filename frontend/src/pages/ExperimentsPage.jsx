import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useI18n } from '../i18n'
import { parseExperiments } from '../types/contracts'

function parseSummary(summaryJson) {
  if (!summaryJson) return null
  try {
    const parsed = JSON.parse(summaryJson)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function formatScore(value) {
  return value === null || value === undefined ? '—' : Number(value).toFixed(2)
}

export default function ExperimentsPage() {
  const { t } = useI18n()
  const { data: items = [], isLoading, isError } = useQuery({
    queryKey: ['experiments'],
    queryFn: async () => parseExperiments((await api.get('/experiments')).data),
  })

  return (
    <div className="page-content experiments-page" aria-busy={isLoading}>
      <header className="page-header">
        <div>
          <h1>{t('experimentsPage.title')}</h1>
          <p>{t('experimentsPage.subtitle')}</p>
        </div>
      </header>

      {isError ? <div className="error-box">{t('experimentsPage.loadError')}</div> : null}
      {isLoading ? <div className="app-loading" role="status">{t('common.loading')}</div> : null}

      {!isLoading && items.length === 0 ? (
        <p className="muted-line">{t('experimentsPage.empty')}</p>
      ) : !isLoading ? (
        items.map((item) => {
          const summary = parseSummary(item.summary_json)
          const benchmark = summary?.kind === 'benchmark' && summary.result ? summary : null
          const benchmarkResult = benchmark?.result
          const rowLabels = [
            [t('experimentsPage.primaryChunks'), summary?.primary_chunk_count],
            [t('experimentsPage.secondaryChunks'), summary?.secondary_chunk_count],
            [t('experimentsPage.primaryRetrieval'), summary?.primary_retrieval_ms],
            [t('experimentsPage.secondaryRetrieval'), summary?.secondary_retrieval_ms],
          ]
          return (
            <section className="card experiment-card" key={item.id} data-testid="experiment-card">
              <div className="experiment-head">
                <div>
                  <strong>{item.primary_strategy}{item.secondary_strategy ? ` vs ${item.secondary_strategy}` : ''}</strong>
                  <span className="muted-line"> {t('experimentsPage.via')} {item.provider}</span>
                </div>
                <span className="muted-line">{item.created_at ? new Date(item.created_at).toLocaleString() : '—'}</span>
              </div>
              <p><strong>{t('experimentsPage.question')}:</strong> {item.question}</p>

              {benchmark ? (
                <div className="benchmark-history">
                  <div className="kpi-grid small">
                    {benchmark.mode === 'single' ? (
                      <div className="kpi-card card">
                        <span className="kpi-label">{t('experimentsPage.benchmarkAverage')}</span>
                        <span className="kpi-value">{formatScore(benchmarkResult.average_keyword_score)}</span>
                      </div>
                    ) : (
                      <>
                        <div className="kpi-card card">
                          <span className="kpi-label">{benchmarkResult.primary_strategy}</span>
                          <span className="kpi-value">{formatScore(benchmarkResult.primary_average)}</span>
                        </div>
                        <div className="kpi-card card">
                          <span className="kpi-label">{benchmarkResult.secondary_strategy}</span>
                          <span className="kpi-value">{formatScore(benchmarkResult.secondary_average)}</span>
                        </div>
                        <div className="kpi-card card">
                          <span className="kpi-label">{t('experimentsPage.benchmarkWinner')}</span>
                          <span className="kpi-value">{benchmarkResult.winner || '—'}</span>
                        </div>
                      </>
                    )}
                    <div className="kpi-card card">
                      <span className="kpi-label">{t('experimentsPage.benchmarkEvaluated')}</span>
                      <span className="kpi-value">{benchmarkResult.evaluated_items}/{benchmarkResult.total_items}</span>
                    </div>
                  </div>
                  {benchmarkResult.warning ? <div className="warning-box">{benchmarkResult.warning}</div> : null}
                  <div className="comparison-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t('experimentsPage.benchmarkQuestion')}</th>
                          {benchmark.mode === 'single' ? <th>{t('experimentsPage.benchmarkScore')}</th> : null}
                          {benchmark.mode === 'single' ? <th>{t('experimentsPage.benchmarkHits')}</th> : null}
                          {benchmark.mode === 'compare' ? <th>{benchmarkResult.primary_strategy}</th> : null}
                          {benchmark.mode === 'compare' ? <th>{benchmarkResult.secondary_strategy}</th> : null}
                          {benchmark.mode === 'compare' ? <th>{t('experimentsPage.benchmarkWinner')}</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {(benchmark.mode === 'single' ? benchmarkResult.items : benchmarkResult.rows).map((row, index) => (
                          <tr key={`${row.question}-${index}`}>
                            <td>{row.question}</td>
                            {benchmark.mode === 'single' ? <td>{formatScore(row.score_ratio)}</td> : null}
                            {benchmark.mode === 'single' ? <td>{row.keyword_hits}/{row.keyword_total}</td> : null}
                            {benchmark.mode === 'compare' ? <td>{formatScore(row.primary_score)}</td> : null}
                            {benchmark.mode === 'compare' ? <td>{formatScore(row.secondary_score)}</td> : null}
                            {benchmark.mode === 'compare' ? <td>{row.winner}</td> : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : summary ? (
                <div className="kpi-grid small">
                  {rowLabels.filter(([, value]) => value !== undefined && value !== null).map(([label, value]) => (
                    <div className="kpi-card card" key={label}>
                      <span className="kpi-label">{label}</span>
                      <span className="kpi-value">{value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted-line">{t('experimentsPage.noSummary')}</p>
              )}
            </section>
          )
        })
      ) : null}
    </div>
  )
}
