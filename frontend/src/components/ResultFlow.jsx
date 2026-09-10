import ComparePanel from './ComparePanel'
import DiffSummary from './DiffSummary'
import ScorecardRow from './ScorecardRow'
import SemanticComparison from './SemanticComparison'
import { groupHref, strategyLabel } from '../utils/semantics'
import { useI18n } from '../i18n'

function answerTitle(result, fallback) {
  if (result && result.strategy) {
    return strategyLabel(result.strategy)
  }
  return fallback
}

export default function ResultFlow({
  primary = null,
  secondary = null,
  semanticGroup = null,
  semanticStatus = 'idle',
  semanticError = '',
}) {
  const { t } = useI18n()
  if (!primary && !secondary) {
    return null
  }

  return (
    <div className="result-flow" data-testid="result-flow">
      <section className="grid two-col">
        <div className="card result-card" data-testid="primary-answer">
          <h2>{t('resultFlow.answerTitle', { strategy: answerTitle(primary, t('resultFlow.primary')) })}</h2>
          <ComparePanel result={primary} />
        </div>
        <div className="card result-card" data-testid="secondary-answer">
          <h2>{t('resultFlow.answerTitle', { strategy: answerTitle(secondary, t('resultFlow.secondary')) })}</h2>
          <ComparePanel result={secondary} />
        </div>
      </section>

      <SemanticComparison group={semanticGroup} status={semanticStatus} error={semanticError} />

      <section className="card" data-testid="performance-comparison">
        <h2>{t('resultFlow.performance')}</h2>
        {primary && secondary ? (
          <>
            <DiffSummary primary={primary} secondary={secondary} />
            <div className="scorecard-table">
              <ScorecardRow label={t('resultFlow.retrievalMs')} primaryValue={primary.metrics.retrieval_ms} secondaryValue={secondary.metrics.retrieval_ms} />
              <ScorecardRow label={t('resultFlow.llmMs')} primaryValue={primary.metrics.llm_ms} secondaryValue={secondary.metrics.llm_ms} />
              <ScorecardRow label={t('resultFlow.chunks')} primaryValue={primary.metrics.chunk_count} secondaryValue={secondary.metrics.chunk_count} />
              <ScorecardRow label={t('resultFlow.sources')} primaryValue={primary.metrics.source_count} secondaryValue={secondary.metrics.source_count} />
              <ScorecardRow label={t('resultFlow.answer')} primaryValue={primary.metrics.answer_length} secondaryValue={secondary.metrics.answer_length} />
            </div>
          </>
        ) : (
          <p className="muted-line">{t('resultFlow.compareHint')}</p>
        )}
      </section>

      {semanticGroup && semanticGroup.comparison_group_id ? (
        <div className="compare-actions" data-testid="compare-actions">
          <a className="secondary-btn compare-action" href={groupHref(semanticGroup.comparison_group_id)}>
            {t('resultFlow.viewFullComparison')}
          </a>
          <a className="secondary-btn compare-action" href={groupHref(semanticGroup.comparison_group_id, true)} data-testid="report-link">
            {t('resultFlow.viewReport')}
          </a>
        </div>
      ) : null}
    </div>
  )
}
