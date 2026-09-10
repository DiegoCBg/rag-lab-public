import { Box, LinearProgress, Paper, Stack, Typography } from '@mui/material'
import { useI18n } from '../i18n'

const getMetric = (metrics, camel, snake) => metrics?.[camel] ?? metrics?.[snake] ?? null
const display = (value, suffix = '') => value === null || value === undefined ? '—' : `${value}${suffix}`

function MetricItem({ label, value, tone }) {
  return (
    <Paper className="metric-item" elevation={0} data-tone={tone || 'neutral'}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography className="metric-number">{value}</Typography>
    </Paper>
  )
}

export default function MetricsPanel({ primary, secondary = null, loading = false, density = 'compact', highlightLowerLatency = true }) {
  const { t } = useI18n()
  const pTotal = getMetric(primary, 'totalMs', 'total_ms')
  const sTotal = getMetric(secondary, 'totalMs', 'total_ms')
  const primaryWins = highlightLowerLatency && pTotal !== null && sTotal !== null && pTotal < sTotal
  const secondaryWins = highlightLowerLatency && pTotal !== null && sTotal !== null && sTotal < pTotal

  return (
    <section className="metrics-panel" aria-live="polite" data-density={density}>
{loading ? <LinearProgress className="metrics-loading" /> : null}
      <MetricItem label={t('metricsPanel.total')} value={display(pTotal, ' ms')} tone={primaryWins ? 'good' : 'neutral'} />
      <MetricItem label={t('metricsPanel.retrieval')} value={display(getMetric(primary, 'retrievalMs', 'retrieval_ms'), ' ms')} />
      <MetricItem label={t('metricsPanel.llm')} value={display(getMetric(primary, 'llmMs', 'llm_ms'), ' ms')} />
      <MetricItem label={t('metricsPanel.chunks')} value={display(getMetric(primary, 'chunkCount', 'chunk_count'))} />
      <MetricItem label={t('metricsPanel.sources')} value={display(getMetric(primary, 'sourceCount', 'source_count'))} />
      {secondary ? (
        <MetricItem label={t('metricsPanel.compared')} value={display(sTotal, ' ms')} tone={secondaryWins ? 'good' : 'neutral'} />
      ) : null}
    </section>
  )
}
