import { useI18n } from '../i18n'

export default function DiffSummary({ primary, secondary }) {
  const { t } = useI18n()
  if (!primary || !secondary) {
    return <p className="muted-line">{t('diffSummary.noData')}</p>
  }

  const chunkDelta = primary.metrics.chunk_count - secondary.metrics.chunk_count
  const sourceDelta = primary.metrics.source_count - secondary.metrics.source_count
  const retrievalDelta = primary.metrics.retrieval_ms - secondary.metrics.retrieval_ms

  return (
    <div>
      <p><strong>{t('diffSummary.chunkDelta')}:</strong> {chunkDelta}</p>
      <p><strong>{t('diffSummary.sourceDelta')}:</strong> {sourceDelta}</p>
      <p><strong>{t('diffSummary.retrievalDelta')}:</strong> {retrievalDelta.toFixed(2)} ms</p>
    </div>
  )
}
