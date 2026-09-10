import { useEffect, useState } from 'react'
import { Box, Button, Chip, Drawer, IconButton, Paper, Tab, Tabs, Tooltip, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import MarkdownContent from './MarkdownContent'
import {
  analysesByStrategy,
  claimTypeLabel,
  displayClaimItems,
  displayList,
  exclusiveClaimsByStrategy,
  isDocumentMixed,
  juncaoDecision,
  strategyHumanLabel,
} from '../utils/semantics'
import { useI18n } from '../i18n'

function InsightTable({ rows, emptyLabel }) {
  if (!rows.length) return <p className="muted-line comparison-insight-empty">{emptyLabel}</p>
  return <div className="comparison-insight-table-wrap"><table className="insights-table"><thead><tr><th>Estratégia</th><th>Afirmação</th><th>Classificação</th><th>Motivo</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.strategy}-${index}`} data-testid={row.testId}><td><strong>{row.strategy}</strong></td><td><MarkdownContent>{row.claim}</MarkdownContent></td><td><MarkdownContent>{row.evidence}</MarkdownContent></td><td><MarkdownContent>{row.problem}</MarkdownContent></td></tr>)}</tbody></table></div>
}

function synthesisPreview(value) {
  const paragraphs = String(value || '').split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean)
  return paragraphs.slice(0, 2).join('\n\n')
}

function answerPreview(value) {
  const paragraphs = String(value || '')
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter((item) => item && !/^#{1,6}\s/.test(item))
  return paragraphs.slice(0, 2).join('\n\n')
}

function coverageText(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  const percentage = numeric <= 1 ? numeric * 100 : numeric
  return `${percentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

export default function ComparisonDetailGrid({ group }) {
  const { t } = useI18n()
  const [inspecting, setInspecting] = useState(null)
  const [retrievalOpen, setRetrievalOpen] = useState(false)
  const [activeStrategy, setActiveStrategy] = useState('')
  const [expandedResponses, setExpandedResponses] = useState({})
  const [executiveExpanded, setExecutiveExpanded] = useState(false)
  const [activeDetailTab, setActiveDetailTab] = useState('consensus')

  useEffect(() => {
    setActiveStrategy(group?.executions?.[0]?.strategy || '')
    setExpandedResponses({})
    setExecutiveExpanded(false)
    setRetrievalOpen(false)
    setActiveDetailTab('consensus')
  }, [group?.comparison_group_id])

  if (!group) return <p className="muted-line">{t('comparisonDetailGrid.noGroup')}</p>

  const comparison = group.comparison || {}
  const decision = juncaoDecision(group)
  const analyses = analysesByStrategy(group)
  const executions = group.executions || []
  const currentStrategy = activeStrategy || executions[0]?.strategy || ''
  const currentExecution = executions.find((execution) => execution.strategy === currentStrategy) || executions[0]
  const currentAnalysis = analyses.find(({ strategy }) => strategy === currentExecution?.strategy)?.analysis || {}
  const consensus = displayClaimItems(comparison.consensus_claims)
  const exclusive = exclusiveClaimsByStrategy(comparison)
  const contradictions = displayClaimItems(comparison.contradictions)
  const coverageGaps = displayList(comparison.coverage_gaps)
  const unsupported = displayClaimItems(comparison.unsupported_claims)
  const mixed = isDocumentMixed(executions)
  const documentList = group.documents || []
  const documentCount = documentList.length || 0
  const strategyCount = executions.length
  const documents = documentList.join(', ') || '—'
  const retrievalQuality = Array.isArray(comparison.retrieval_quality) ? comparison.retrieval_quality : []

  const claims = (Array.isArray(currentAnalysis.claims) ? currentAnalysis.claims : []).map((claim) => ({ ...claim, type: claimTypeLabel(claim.type) }))
  const groundedClaims = claims.filter((claim) => claim.grounded).slice(0, 3)
  const fallbackSummary = answerPreview(currentExecution?.raw_answer)
  const hasStructuredAnalysis = Boolean(currentAnalysis.main_topic || claims.length)
  const completeSynthesis = typeof comparison.combined_synthesis === 'string' && comparison.combined_synthesis.trim()
    ? comparison.combined_synthesis.trim()
    : t('comparisonDetailGrid.noSynthesis')
  const previewSynthesis = synthesisPreview(completeSynthesis) || completeSynthesis
  const canExpandSynthesis = previewSynthesis !== completeSynthesis
  const statusLabel = decision.level === 'valid' ? t('comparisonsPage.statusValid') : decision.level === 'partial' ? t('comparisonsPage.statusPartial') : t('comparisonsPage.statusInvalid')
  const completeRetrievalCount = retrievalQuality.filter((item) => item.status === 'complete').length
  const partialRetrievalCount = Math.max(retrievalQuality.length - completeRetrievalCount, 0)
  const confidenceSummary = retrievalQuality.length
    ? t('comparisonDetailGrid.confidenceSummary', { complete: completeRetrievalCount, partial: partialRetrievalCount, total: retrievalQuality.length })
    : decision.message || t('comparisonDetailGrid.noReason')
  const consensusRows = consensus.map((claim) => ({ strategy: claim.strategies?.length ? claim.strategies.map(strategyHumanLabel).join(', ') : t('comparisonDetailGrid.allStrategies'), claim: claim.text, evidence: claim.display_label, problem: claim.classification_reason || t('comparisonDetailGrid.noProblem') }))
  const exclusiveRows = exclusive.flatMap(({ label, items }) => items.map((claim) => ({ strategy: strategyHumanLabel(label), claim: claim.text, evidence: claim.display_label, problem: claim.classification_reason || t('comparisonDetailGrid.noProblem') })))
  const divergenceRows = contradictions.map((claim, index) => ({ strategy: claim.strategies?.length ? claim.strategies.map(strategyHumanLabel).join(', ') : t('comparisonDetailGrid.comparison'), claim: claim.text, evidence: claim.display_label, problem: claim.classification_reason || t('comparisonDetailGrid.contradictionProblem'), testId: `contradiction-${index}` }))
  const gapRows = coverageGaps.map((claim) => ({ strategy: t('comparisonDetailGrid.comparison'), claim, evidence: t('comparisonDetailGrid.coverageEvidence'), problem: t('comparisonDetailGrid.coverageProblem') }))
  const unsupportedRows = unsupported.map((claim) => ({ strategy: claim.strategies?.length ? claim.strategies.map(strategyHumanLabel).join(', ') : t('comparisonDetailGrid.unknownStrategy'), claim: claim.text, evidence: claim.display_label, problem: claim.classification_reason || t('comparisonDetailGrid.unsupportedProblem') }))
  const toggleResponse = (strategy) => setExpandedResponses((current) => ({ ...current, [strategy]: !current[strategy] }))

  const renderStrategyPanel = () => currentExecution ? <div className="comparison-strategy-pane" id={`strategy-${currentExecution.strategy}`}><div className="comparison-strategy-pane-head"><div><h4>{strategyHumanLabel(currentExecution.strategy)}</h4><span className="comparison-technical-id">{currentExecution.strategy}</span></div><span className={`status-tag ${currentExecution.status === 'ok' ? 'ok' : 'err'}`}>{currentExecution.status === 'ok' ? 'OK' : t('comparisonDetailGrid.executionError')}</span></div>{currentExecution.error ? <p className="error-box">{currentExecution.error}</p> : null}<div className="comparison-strategy-summary"><strong>{t('comparisonDetailGrid.strategySummary')}</strong><MarkdownContent>{currentAnalysis.main_topic || fallbackSummary || t('comparisonDetailGrid.noStrategySummary')}</MarkdownContent>{!hasStructuredAnalysis && fallbackSummary ? <p className="muted-line">{t('comparisonDetailGrid.auditUnavailable')}</p> : null}</div><div className="comparison-evidence-list"><strong>{t('comparisonDetailGrid.mainEvidence')}</strong>{groundedClaims.length ? <ul>{groundedClaims.map((claim, index) => <li key={index}><MarkdownContent>{claim.text}</MarkdownContent></li>)}</ul> : <p className="muted-line">{t('comparisonDetailGrid.noEvidence')}</p>}</div><Button variant="outlined" size="small" onClick={() => toggleResponse(currentExecution.strategy)} aria-expanded={Boolean(expandedResponses[currentExecution.strategy])} className="comparison-full-response-toggle">{expandedResponses[currentExecution.strategy] ? t('comparisonDetailGrid.hideFullResponse') : t('comparisonDetailGrid.showFullResponse')}</Button>{expandedResponses[currentExecution.strategy] ? <div className="comparison-full-response"><MarkdownContent>{currentExecution.raw_answer || '—'}</MarkdownContent></div> : null}<div className="comparison-strategy-claims"><h4>{t('comparisonDetailGrid.claimsTitleShort')}</h4>{claims.length ? <table className="claims-table"><thead><tr><th>{t('comparisonDetailGrid.colClaim')}</th><th>{t('comparisonDetailGrid.colType')}</th><th>{t('comparisonDetailGrid.colEvidence')}</th></tr></thead><tbody>{claims.map((claim, index) => <tr key={index} className="claim-row" data-testid="claim-row" onClick={() => setInspecting({ claim, strategy: currentExecution.strategy })}><td><MarkdownContent>{claim.text || '—'}</MarkdownContent></td><td>{claim.type || t('comparisonDetailGrid.claimTypeGeneral')}</td><td>{claim.grounded ? t('comparisonDetailGrid.withEvidence') : t('comparisonDetailGrid.withoutEvidence')}</td></tr>)}</tbody></table> : <p className="muted-line">{t('comparisonDetailGrid.noClaims')}</p>}</div></div> : <p className="muted-line">{t('comparisonDetailGrid.noThemes')}</p>

  return (
    <div className="comparison-detail" data-testid="comparison-detail">
      <section className="comparison-executive-summary" id="comparison-summary" aria-labelledby="comparison-summary-title">
        <div className="comparison-executive-head">
          <div>
            <Typography component="h2" id="comparison-summary-title" variant="h5">{t('comparisonDetailGrid.executiveTitle')}</Typography>
            <Typography variant="caption" className="comparison-technical-id">{group.comparison_group_id}</Typography>
          </div>
          <Tooltip title={t('comparisonDetailGrid.statusLegend')}><Chip label={statusLabel} className={`comparison-status-chip is-${decision.level}`} /></Tooltip>
        </div>

        <div className="comparison-executive-meta" aria-label={t('comparisonDetailGrid.scopeTitle')}>
          <span>{t(documentCount === 1 ? 'comparisonDetailGrid.documentCountSingular' : 'comparisonDetailGrid.documentCountPlural', { count: documentCount })}</span>
          <span>{t(strategyCount === 1 ? 'comparisonDetailGrid.strategyCountSingular' : 'comparisonDetailGrid.strategyCountPlural', { count: strategyCount })}</span>
          <span title={documents}>{documents}</span>
        </div>

        <div className="comparison-executive-overview">
          <article className="comparison-synthesis-brief">
            <span className="comparison-panel-kicker">{t('comparisonDetailGrid.synthesisSection')}</span>
            <MarkdownContent>{executiveExpanded ? completeSynthesis : previewSynthesis}</MarkdownContent>
            {canExpandSynthesis ? <Button variant="text" size="small" onClick={() => setExecutiveExpanded((value) => !value)} className="comparison-inline-action">{executiveExpanded ? t('comparisonDetailGrid.hideFullSynthesis') : t('comparisonDetailGrid.showFullSynthesis')}</Button> : null}
          </article>

          <aside className="comparison-confidence-panel">
            <span className="comparison-panel-kicker">{t('comparisonDetailGrid.confidenceTitle')}</span>
            <p>{confidenceSummary}</p>
            <details open={executiveExpanded}>
              <summary onClick={(event) => { event.preventDefault(); setExecutiveExpanded((value) => !value) }}>{t('comparisonDetailGrid.evaluationDetails')}</summary>
              <MarkdownContent>{decision.message || t('comparisonDetailGrid.noReason')}</MarkdownContent>
            </details>
          </aside>
        </div>

        {decision.level !== 'valid' ? <div className={`comparison-synthesis-warning is-${decision.level}`} role="alert"><strong>{t('comparisonDetailGrid.partialSynthesis')}</strong><span>{t('comparisonDetailGrid.partialSynthesisHint')}</span></div> : null}

        {retrievalQuality.length ? <div className="comparison-retrieval-compact" aria-label={t('comparisonDetailGrid.retrievalQualityTitle')}>
          <div>
            <strong>{t('comparisonDetailGrid.retrievalQualityTitle')}</strong>
            <span>{t('comparisonDetailGrid.retrievalSummary', { complete: completeRetrievalCount, partial: partialRetrievalCount })}</span>
          </div>
          <Button variant="outlined" size="small" onClick={() => setRetrievalOpen(true)}>{t('comparisonDetailGrid.inspectRetrieval')}</Button>
        </div> : null}
      </section>

      {mixed ? <div className="warning-box mixed-documents" role="alert"><strong>{t('comparisonDetailGrid.attention')}:</strong> {t('comparisonDetailGrid.mixedWarning')}</div> : null}

      <section className="comparison-detail-workspace" aria-labelledby="comparison-detail-title">
        <div className="comparison-section-heading">
          <div>
            <h3 id="comparison-detail-title">{t('comparisonDetailGrid.detailsTitle')}</h3>
            <p>{t('comparisonDetailGrid.detailsHint')}</p>
          </div>
        </div>
        <Tabs value={activeDetailTab} onChange={(_, value) => setActiveDetailTab(value)} variant="scrollable" scrollButtons="auto" className="comparison-detail-tabs">
          <Tab value="consensus" label={t('comparisonDetailGrid.consensusTitleShort')} />
          <Tab value="exclusive" label={t('comparisonDetailGrid.exclusiveTitleShort')} />
          <Tab value="divergences" label={t('comparisonDetailGrid.divergenceTitleShort')} />
          <Tab value="gaps" label={t('comparisonDetailGrid.gapsTitleShort')} />
          <Tab value="unsupported" label={t('comparisonDetailGrid.unsupportedTitle')} />
          <Tab value="strategies" label={t('comparisonDetailGrid.answersByStrategy')} />
        </Tabs>

        <div className="comparison-detail-tab-panel">
          {activeDetailTab === 'consensus' ? <InsightTable rows={consensusRows} emptyLabel={t('comparisonDetailGrid.noConsensus')} /> : null}
          {activeDetailTab === 'exclusive' ? <InsightTable rows={exclusiveRows} emptyLabel={t('comparisonDetailGrid.noExclusive')} /> : null}
          {activeDetailTab === 'divergences' ? <InsightTable rows={divergenceRows} emptyLabel={t('comparisonDetailGrid.noDivergence')} /> : null}
          {activeDetailTab === 'gaps' ? <InsightTable rows={gapRows} emptyLabel={t('comparisonDetailGrid.noCoverageGaps')} /> : null}
          {activeDetailTab === 'unsupported' ? <InsightTable rows={unsupportedRows} emptyLabel={t('comparisonDetailGrid.noUnsupported')} /> : null}
          {activeDetailTab === 'strategies' ? <div className="comparison-strategy-analysis"><Tabs value={currentStrategy} onChange={(_, value) => setActiveStrategy(value)} variant="scrollable" scrollButtons="auto" className="comparison-strategy-tabs">{executions.map((execution) => <Tab key={execution.strategy} value={execution.strategy} title={t('comparisonsPage.originalName', { value: execution.strategy })} label={strategyHumanLabel(execution.strategy)} />)}</Tabs>{renderStrategyPanel()}</div> : null}
        </div>
      </section>

      <Drawer anchor="right" open={retrievalOpen} onClose={() => setRetrievalOpen(false)} PaperProps={{ className: 'comparison-retrieval-drawer-paper' }}>
        <div className="comparison-retrieval-drawer-head">
          <div>
            <Typography variant="h6" className="claim-audit-title">{t('comparisonDetailGrid.retrievalQualityTitle')}</Typography>
            <Typography variant="caption" color="text.secondary">{t('comparisonDetailGrid.retrievalDrawerHint')}</Typography>
          </div>
          <IconButton onClick={() => setRetrievalOpen(false)} aria-label={t('comparisonDetailGrid.closeRetrieval')}><CloseIcon /></IconButton>
        </div>
        <table className="comparison-retrieval-table">
          <thead><tr><th>{t('comparisonDetailGrid.colStrategy')}</th><th>Chunks</th><th>{t('comparisonDetailGrid.coverageLabel')}</th><th>{t('comparisonDetailGrid.colStatus')}</th></tr></thead>
          <tbody>{retrievalQuality.map((item) => {
            const coverage = item.coverage || item.retrieval_trace?.coverage || {}
            const coveredChunks = Array.isArray(item.chunks) ? item.chunks.length : (item.chunk_count ?? '—')
            return <tr key={item.strategy}><td><strong>{strategyHumanLabel(item.strategy)}</strong></td><td>{coveredChunks}</td><td>{coverageText(coverage.coverage)}</td><td><Chip size="small" label={item.status === 'complete' ? t('comparisonDetailGrid.coverageComplete') : t('comparisonDetailGrid.coveragePartial')} className={`comparison-status-chip is-${item.status === 'complete' ? 'valid' : 'partial'}`} /></td></tr>
          })}</tbody>
        </table>
      </Drawer>

      <Drawer anchor="right" open={Boolean(inspecting)} onClose={() => setInspecting(null)} PaperProps={{ className: 'claim-audit-drawer-paper' }}>{inspecting ? <div><div className="claim-audit-head"><div><Typography variant="h6" className="claim-audit-title">{t('comparisonDetailGrid.claimAuditTitle')}</Typography><Typography variant="caption" color="text.secondary">{t('comparisonDetailGrid.strategy')}: {strategyHumanLabel(inspecting.strategy)}</Typography></div><IconButton onClick={() => setInspecting(null)} aria-label={t('comparisonDetailGrid.closeAria')}><CloseIcon /></IconButton></div><Box className="claim-audit-claim-card"><Typography variant="caption" className="claim-audit-caption">ID: {inspecting.claim.claim_id || 'N/A'} · {t('comparisonDetailGrid.type')}: {inspecting.claim.type || t('comparisonDetailGrid.claimTypeGeneral')}</Typography><div className="claim-audit-text"><MarkdownContent>{inspecting.claim.text}</MarkdownContent></div></Box><Typography variant="subtitle2" className="claim-audit-section-title">{t('comparisonDetailGrid.evidenceStatusTitle')}:</Typography><Box className={`claim-evidence-box ${inspecting.claim.grounded ? 'is-grounded' : 'is-ungrounded'}`}><strong>{inspecting.claim.grounded ? t('comparisonDetailGrid.groundedTitle') : t('comparisonDetailGrid.notGroundedTitle')}:</strong> {inspecting.claim.grounded ? t('comparisonDetailGrid.groundedText') : t('comparisonDetailGrid.notGroundedText')}</Box>{inspecting.claim.supporting_quotes?.length ? <Box className="claim-quotes-block"><Typography variant="subtitle2" className="claim-quotes-title">{t('comparisonDetailGrid.supportingQuotes')}:</Typography>{inspecting.claim.supporting_quotes.map((quote, index) => <Paper key={index} elevation={0} className="claim-quote-card"><MarkdownContent>{typeof quote === 'string' ? quote : quote?.quote || quote?.text || ''}</MarkdownContent></Paper>)}</Box> : null}<Button variant="contained" fullWidth onClick={() => setInspecting(null)} className="claim-audit-close">{t('comparisonDetailGrid.closeAudit')}</Button></div> : null}</Drawer>
    </div>
  )
}
