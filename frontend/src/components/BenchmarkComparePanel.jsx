import { useState } from 'react'
import { api, apiErrorMessage } from '../api/client'
import { useI18n } from '../i18n'
import { parseBenchmarkCompare } from '../types/contracts'
import { insertTabAtSelection } from '../utils/insertTabAtSelection'

export default function BenchmarkComparePanel({ primaryStrategy, secondaryStrategy, provider, contentTypeFilter, statusFilter }) {
  const { t } = useI18n()
  const sample = t('benchmarkComparePanel.sample')
  const [text, setText] = useState(sample)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const formatScore = (score) => score == null ? t('benchmarkComparePanel.noCriterion') : score.toFixed(2)

  const onRun = async () => {
    setError('')
    try {
      const items = text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [question, keywords] = line.split('\t')
          return {
            question,
            expected_keywords: (keywords || '').split(',').map((item) => item.trim()).filter(Boolean),
          }
        })

      const response = await api.post('/benchmark/compare', {
        items,
        primary_strategy: primaryStrategy,
        secondary_strategy: secondaryStrategy,
        provider,
        content_type_filter: contentTypeFilter || null,
        status_filter: statusFilter || null,
      })
      setResult(parseBenchmarkCompare(response.data))
    } catch (err) {
      setError(apiErrorMessage(err, t('benchmarkComparePanel.compareError')))
    }
  }

  return (
    <div>
<p className="muted-line">{t('benchmarkComparePanel.intro')}</p>
      <textarea rows="7" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(event) => insertTabAtSelection(event, setText)} />
      <button type="button" onClick={onRun}>{t('benchmarkComparePanel.run')}</button>
      {error ? <div className="error-box">{error}</div> : null}
      {result ? (
        <div className="benchmark-box">
          {result.warning ? <div className="warning-box">{result.warning}</div> : null}
          <p><strong>{t('benchmarkComparePanel.winner')}</strong> {result.winner}</p>
          <p><strong>{result.primary_strategy}:</strong> {formatScore(result.primary_average)}</p>
          <p><strong>{result.secondary_strategy}:</strong> {formatScore(result.secondary_average)}</p>
          <p className="muted-line">{t('benchmarkComparePanel.evaluatedItems', { evaluated: result.evaluated_items, total: result.total_items })}</p>
          <ul>
            {result.rows.map((row) => (
              <li key={row.question}>
                <strong>{row.question}</strong> — {formatScore(row.primary_score)} vs {formatScore(row.secondary_score)} ({row.winner})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
