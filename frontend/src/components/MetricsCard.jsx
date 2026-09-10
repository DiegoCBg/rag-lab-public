import { useI18n } from '../i18n'

export default function MetricsCard({ title, metrics }) {
  const { t } = useI18n()
  if (!metrics) {
    return <p className="muted-line">{t('metricsCard.noMetrics')}</p>
  }

  return (
    <div className="metrics-card">
      <h3>{title}</h3>
      <ul className="metrics-list">
        <li>{t('metricsCard.retrieval', { value: metrics.retrieval_ms })}</li>
        <li>{t('metricsCard.llm', { value: metrics.llm_ms })}</li>
        <li>{t('metricsCard.chunks', { value: metrics.chunk_count })}</li>
        <li>{t('metricsCard.sources', { value: metrics.source_count })}</li>
        <li>{t('metricsCard.answerSize', { value: metrics.answer_length })}</li>
      </ul>
    </div>
  )
}
