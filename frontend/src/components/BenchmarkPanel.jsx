import { useState } from 'react'
import { api, apiErrorMessage } from '../api/client'
import { useI18n } from '../i18n'
import { parseBenchmarkRun } from '../types/contracts'
import { insertTabAtSelection } from '../utils/insertTabAtSelection'

export default function BenchmarkPanel({ strategy, provider, contentTypeFilter, statusFilter }) {
  const { t } = useI18n()
  const sample = t('benchmarkPanel.sample')
  const [text, setText] = useState(sample)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const formatScore = (score) => score == null ? t('benchmarkPanel.noCriterion') : score.toFixed(2)

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

      const response = await api.post('/benchmark/run', {
        items,
        strategy,
        provider,
        content_type_filter: contentTypeFilter || null,
        status_filter: statusFilter || null,
      })
      setResult(parseBenchmarkRun(response.data))
    } catch (err) {
      setError(apiErrorMessage(err, t('benchmarkPanel.runError')))
    }
  }

  return (
    <div>
<p className="muted-line">{t('benchmarkPanel.formatHint')}</p>
      <textarea rows="7" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(event) => insertTabAtSelection(event, setText)} />
      <button type="button" onClick={onRun}>{t('benchmarkPanel.run')}</button>
      {error ? <div className="error-box">{error}</div> : null}
      {result ? (
        <div className="benchmark-box">
          {result.warning ? <div className="warning-box">{result.warning}</div> : null}
          <p><strong>{t('benchmarkPanel.averageScore')}</strong> {formatScore(result.average_keyword_score)}</p>
          <p className="muted-line">{t('benchmarkPanel.evaluatedItems', { evaluated: result.evaluated_items, total: result.total_items })}</p>
          <ul>
            {result.items.map((item) => (
              <li key={item.question}>
                <strong>{item.question}</strong> — {item.keyword_hits}/{item.keyword_total} ({formatScore(item.score_ratio)})<br />
                <span className="muted-line">{item.answer_preview}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
