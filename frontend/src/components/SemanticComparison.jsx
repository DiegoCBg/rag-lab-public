import {
  analysesByStrategy,
  displayClaimItems,
  displayList,
  exclusiveClaimsByStrategy,
  isDocumentMixed,
  juncaoDecision,
  strategyLabel,
} from '../utils/semantics'
import { I18nProvider, useI18n } from '../i18n'
import MarkdownContent from './MarkdownContent'
import TokenUsagePanel from './TokenUsagePanel'

function MixedDocumentsNotice({ group }) {
  const { t } = useI18n()
  if (!isDocumentMixed(group.executions || [])) {
    return null
  }
  return (
    <div className="warning-box mixed-documents" role="alert" data-testid="mixed-documents-warning">
      <strong>{t('semanticComparison.attention')}</strong> {t('semanticComparison.mixedDocumentsWarning')}
    </div>
  )
}

function JuncaoBox({ decision }) {
  const { t } = useI18n()
  const toneClass = decision.level === 'valid' ? 'valid' : decision.level === 'partial' ? 'partial' : 'invalid'
  return (
    <div className="semantic-block juncao-box" data-testid="juncao-box">
      <h4>{t('semanticComparison.canMerge')}</h4>
      <span className={`status-pill ${toneClass}`} data-testid="juncao-status">{decision.label}</span>
      <p className="muted-line" data-testid="juncao-reason">{t('semanticComparison.justification', { message: decision.message })}</p>
    </div>
  )
}

function SynthesisBox({ comparison, decision }) {
  const { t } = useI18n()
  return (
    <div className="semantic-block" data-testid="synthesis-box">
      <h4>{t('semanticComparison.synthesisTitle')}</h4>
      <div className="synthesis-text"><MarkdownContent>{comparison.combined_synthesis || t('semanticComparison.noSynthesis')}</MarkdownContent></div>
      {decision.level !== 'valid' ? (
        <p className="warning-box" role="alert">
          {t('semanticComparison.partialSynthesis')}
        </p>
      ) : null}
    </div>
  )
}

function ContentBody({ group }) {
  const { t } = useI18n()
  const comparison = group.comparison || {}
  const decision = juncaoDecision(group)
  const analyses = analysesByStrategy(group)
  const consensus = displayClaimItems(comparison.consensus_claims)
  const exclusive = exclusiveClaimsByStrategy(comparison)
  const contradictions = displayClaimItems(comparison.contradictions)
  const coverageGaps = displayList(comparison.coverage_gaps)
  const unsupported = displayClaimItems(comparison.unsupported_claims)
  const omitted = displayList(comparison.information_omitted_from_answer || group.information_omitted_from_answer || [])
  const documents = (group.documents && group.documents.length ? group.documents : []).join(', ') || '—'

  return (
    <div className="semantic-section-body">
      <MixedDocumentsNotice group={group} />
      <p className="semantic-meta"><strong>{t('semanticComparison.documentsUsed')}</strong> {documents}</p>

      <div className="semantic-block themes-block">
        <h4>{t('semanticComparison.themesTitle')}</h4>
        {analyses.length === 0 ? (
          <p className="muted-line">{t('semanticComparison.noThemes')}</p>
        ) : (
          analyses.map(({ strategy, analysis }) => (
            <div className="semantic-theme" key={strategy} data-testid={`theme-${strategy}`}>
              <strong>{strategyLabel(strategy)}</strong>
              <p>{t('semanticComparison.themeIdentified', { topic: analysis.main_topic || '—' })}</p>
            </div>
          ))
        )}
      </div>

      <div className="semantic-block" data-testid="consensus-block">
        <h4>{t('semanticComparison.consensusTitle')}</h4>
        {consensus.length === 0 ? (
          <p className="muted-line">{t('semanticComparison.noConsensus')}</p>
        ) : (
          <ul className="semantic-list">
            {consensus.map((claim, index) => <li key={index}><strong>{claim.display_label}:</strong> {claim.text}</li>)}
          </ul>
        )}
      </div>

      <div className="semantic-block" data-testid="exclusive-block">
        <h4>{t('semanticComparison.exclusiveTitle')}</h4>
        <p className="muted-line">{t('semanticComparison.exclusiveHint')}</p>
        {exclusive.length === 0 ? (
          <p className="muted-line">{t('semanticComparison.noExclusive')}</p>
        ) : (
          exclusive.map(({ label, items }) => (
            <div className="semantic-exclusive" key={label} data-testid={`exclusive-${label}`}>
              <strong>{t('semanticComparison.only', { label })}</strong>
              {items.length === 0 ? (
                <p className="muted-line">{t('semanticComparison.none')}</p>
              ) : (
                <ul className="semantic-list">
                  {items.map((item, index) => <li key={index}><strong>{item.display_label}:</strong> {item.text}</li>)}
                </ul>
              )}
            </div>
          ))
        )}
      </div>

      <div className="semantic-block" data-testid="divergence-block">
        <h4>{t('semanticComparison.divergenceTitle')}</h4>
        {coverageGaps.length > 0 && (
          <p><strong>{t('semanticComparison.coverageDivergence')}</strong> {t('semanticComparison.coverageDivergenceHint')}</p>
        )}
        {coverageGaps.map((gap, index) => <p className="semantic-item" key={`gap-${index}`}>{gap}</p>)}
        {contradictions.map((contra, index) => (
          <p className="semantic-item" key={`contra-${index}`} data-testid={`contradiction-${index}`}>
            <strong>{t('semanticComparison.contradiction')}</strong> {contra.text}
          </p>
        ))}
        {coverageGaps.length === 0 && contradictions.length === 0 && (
          <p className="muted-line">{t('semanticComparison.noDivergence')}</p>
        )}
      </div>

      {omitted.length > 0 && (
        <div className="semantic-block warning-box semantic-block--omitted" data-testid="omitted-block">
          <h4>{t('semanticComparison.omittedTitle')}</h4>
          <p className="muted-line">{t('semanticComparison.omittedHint')}</p>
          <ul className="semantic-list">
            {omitted.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </div>
      )}

      {unsupported.length > 0 && (
        <div className="semantic-block" data-testid="unsupported-block">
          <h4>{t('semanticComparison.unsupportedTitle')}</h4>
          <ul className="semantic-list">
            {unsupported.map((item, index) => <li key={index}><strong>{item.display_label}:</strong> {item.text}</li>)}
          </ul>
        </div>
      )}

      <JuncaoBox decision={decision} />

      <SynthesisBox comparison={comparison} decision={decision} />
      <TokenUsagePanel usage={comparison.token_usage} />
    </div>
  )
}

function SemanticComparisonContent({ group = null, status = 'idle', error = '' }) {
  const { t } = useI18n()
  return (
    <section className="card semantic-section surface-panel" data-testid="content-comparison">
      <h2>{t('semanticComparison.title')}</h2>

      {status === 'loading' && (
        <p className="analyzing-line" data-testid="analysis-status">
          {t('semanticComparison.analyzing')}
        </p>
      )}

      {status === 'failed' && (
        <p className="error-box" role="alert" data-testid="analysis-status">
          {t('semanticComparison.failed', { error: error ? `: ${error}` : '.' })}
        </p>
      )}

      {status === 'partial' && (
        <p className="warning-box" data-testid="analysis-status">
          {t('semanticComparison.partial')}
        </p>
      )}

      {status === 'done' && (
        <p className="success-line" data-testid="analysis-status">{t('semanticComparison.done')}</p>
      )}

      {!group && status === 'idle' && (
        <p className="muted-line">
          {t('semanticComparison.idleHint')}
        </p>
      )}

      {group && <ContentBody group={group} />}
    </section>
  )
}

export default function SemanticComparison(props) {
  return (
    <I18nProvider>
      <SemanticComparisonContent {...props} />
    </I18nProvider>
  )
}
