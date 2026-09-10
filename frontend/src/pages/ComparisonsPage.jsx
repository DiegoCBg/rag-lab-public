import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Slider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import DescriptionIcon from '@mui/icons-material/Description'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CloseIcon from '@mui/icons-material/Close'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningIcon from '@mui/icons-material/Warning'
import ErrorIcon from '@mui/icons-material/Error'
import DeleteIcon from '@mui/icons-material/Delete'
import { api, apiErrorMessage } from '../api/client'
import ComparisonDetailGrid from '../components/ComparisonDetailGrid'
import MarkdownContent from '../components/MarkdownContent'
import { useI18n } from '../i18n'
import { useWorkspaceStore } from '../store/workspace'
import DocumentSelector, { useDocumentSelection, DocumentScopeDetails } from '../components/DocumentSelector'
import { parseComparisonGroup, parseComparisonGroups, parseComparisonRun } from '../types/contracts'
import { strategyCompactLabel, strategyHumanLabel } from '../utils/semantics'

const AVAILABLE_STRATEGIES = [
  { id: 'vector', label: 'RAG Vetorial', technical: 'vector' },
  { id: 'hybrid', label: 'RAG Híbrido', technical: 'hybrid' },
]

const formatHistoryDate = (value, locale) => {
  if (!value) return { time: '—', date: '' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { time: '—', date: '' }
  return {
    time: date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    date: date.toLocaleDateString(locale),
  }
}

export default function ComparisonsPage() {
  const { t, locale } = useI18n()
  const workspace = useWorkspaceStore()
  const selection = useDocumentSelection()
  const [searchParams, setSearchParams] = useSearchParams()
  const [groups, setGroups] = useState([])
  const [question, setQuestion] = useState('')
  const [selectedStrategies, setSelectedStrategies] = useState(['vector', 'hybrid'])
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [markdownReport, setMarkdownReport] = useState('')
  const [showRawReport, setShowRawReport] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deletingGroupId, setDeletingGroupId] = useState('')
  const visibleMarkdownReport = markdownReport

  const loadGroups = async () => {
    const response = await api.get('/comparisons')
    setGroups(parseComparisonGroups(response.data))
  }

  const loadDetail = async (groupId) => {
    setError('')
    setSelectedGroup(null)
    try {
      const response = await api.get(`/comparisons/${groupId}`)
      setSelectedGroup(parseComparisonGroup(response.data))
    } catch (err) {
      setError(apiErrorMessage(err, t('comparisonsPage.loadDetailError')))
    }
  }

  const loadReport = async (groupId) => {
    setError('')
    setMarkdownReport('')
    setShowRawReport(false)
    try {
      const response = await api.get(`/comparisons/${groupId}.md`)
      setMarkdownReport(response.data)
    } catch (err) {
      setError(apiErrorMessage(err, t('comparisonsPage.loadReportError')))
    }
  }

  const closeDetail = () => {
    setSelectedGroup(null)
    setMarkdownReport('')
    setShowRawReport(false)
    setSearchParams({})
  }

  const closeDeleteDialog = () => {
    if (!deletingGroupId) setDeleteTarget(null)
  }

  const onDeleteConfirmed = async () => {
    if (!deleteTarget || deletingGroupId) return

    const groupId = deleteTarget.comparison_group_id
    setDeletingGroupId(groupId)
    setError('')
    try {
      const response = await api.delete(`/comparisons/${groupId}`)
      setGroups((current) => current.filter((group) => group.comparison_group_id !== groupId))
      if (selectedGroup?.comparison_group_id === groupId || searchParams.get('group') === groupId) {
        closeDetail()
      }
      setDeleteTarget(null)
      setInfo(
        response.data?.cleanup_warnings?.length
          ? t('comparisonsPage.deleteSuccessWithWarning')
          : t('comparisonsPage.deleteSuccess'),
      )
    } catch (err) {
      if (err.response?.status === 404) {
        setGroups((current) => current.filter((group) => group.comparison_group_id !== groupId))
        setDeleteTarget(null)
        setInfo(t('comparisonsPage.deleteAlreadyRemoved'))
      } else {
        setError(apiErrorMessage(err, t('comparisonsPage.deleteError')))
      }
    } finally {
      setDeletingGroupId('')
    }
  }

  useEffect(() => {
    loadGroups().catch(() => setError(t('comparisonsPage.loadGroupsError')))
  }, [])

  useEffect(() => {
    const groupId = searchParams.get('group')
    if (groupId) {
      loadDetail(groupId)
      if (searchParams.get('md') === '1') {
        loadReport(groupId)
      }
    }
  }, [searchParams])

  const toggleStrategy = (id) => {
    if (selectedStrategies.includes(id)) {
      if (selectedStrategies.length > 1) {
        setSelectedStrategies(selectedStrategies.filter((s) => s !== id))
      }
    } else {
      setSelectedStrategies([...selectedStrategies, id])
    }
  }

  const onRun = async () => {
    if (!question.trim() || running || !selection.valid) return
    setError('')
    setInfo('')
    setRunning(true)
    try {
      const response = await api.post('/comparisons', {
        question,
        strategies: selectedStrategies.length ? selectedStrategies : null,
        top_k: workspace.topK,
        locale,
        ...selection.payload,
      })
      const comparisonRun = parseComparisonRun(response.data)
      setInfo(t('comparisonsPage.successInfo', { groupId: comparisonRun.comparison_group_id }))
      setSelectedGroup(null)
      setMarkdownReport('')
      await loadDetail(comparisonRun.comparison_group_id)
      await loadGroups()
    } catch (err) {
      setError(apiErrorMessage(err, t('comparisonsPage.runError')))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="page-content comparisons-page">
      <header className="page-header compact page-header-spread">
        <div>
<Typography variant="h4" className="comparison-page-title">
            {t('comparisonsPage.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('comparisonsPage.subtitle')}
          </Typography>
        </div>
      </header>

      {info ? <Alert severity="success" className="comparison-alert">{info}</Alert> : null}
      {error ? <Alert severity="error" className="comparison-alert">{error}</Alert> : null}
      <DocumentSelector selection={selection} disabled={running} />
      {selectedGroup && <DocumentScopeDetails scope={selectedGroup.document_scope || selectedGroup.comparison?.document_scope} />}

      {/* Hero Launcher — Apple Glass Card */}
      <Paper
        className="surface-panel comparison-launcher"
        elevation={0}
      >
        <Typography variant="subtitle1" className="comparison-panel-title">
<AutoAwesomeIcon fontSize="small" /> {t('comparisonsPage.newComparison')}
        </Typography>

        <Typography variant="caption" className="comparison-caption comparison-caption--tight">
          {t('comparisonsPage.factsLabel')}
        </Typography>
        <TextField
          multiline
          minRows={3}
          fullWidth
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t('comparisonsPage.questionPlaceholder')}
          className="comparison-question-field"
        />

        <Typography variant="caption" className="comparison-caption">
{t('comparisonsPage.strategySelection')}
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" className="comparison-chip-row">
          {AVAILABLE_STRATEGIES.map((s) => {
            const isSelected = selectedStrategies.includes(s.id)
            return (
              <Chip
                key={s.id}
                label={s.label}
                onClick={() => toggleStrategy(s.id)}
                color={isSelected ? 'primary' : 'default'}
                variant={isSelected ? 'filled' : 'outlined'}
                className={`comparison-strategy-chip ${isSelected ? 'is-selected' : ''}`}
              />
            )
          })}
        </Stack>

        <div className="comparison-topk-control comparison-topk-control--launcher">
          <Typography variant="caption" className="comparison-topk-label">{t('queryPage.topK')}</Typography>
          <Slider
            aria-label={t('queryPage.topK')}
            value={workspace.topK}
            min={1}
            max={50}
            step={1}
            disabled={running}
            onChange={(_, value) => workspace.setTopK(value)}
            size="small"
          />
          <strong>{workspace.topK}</strong>
        </div>

        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          disabled={!selection.valid || !question.trim() || !selectedStrategies.length || running}
          onClick={onRun}
          className="comparison-primary-action"
        >
{running ? t('comparisonsPage.running') : t('comparisonsPage.run')}
        </Button>
        <div className="comparison-run-hint" aria-live="polite">
          {!question.trim() ? <span>{t('comparisonsPage.questionRequired')}</span> : null}
          {question.trim() && !selectedStrategies.length ? <span>{t('comparisonsPage.strategyRequired')}</span> : null}
          <span>{t('comparisonsPage.selectedCount', { selected: selectedStrategies.length, total: AVAILABLE_STRATEGIES.length })}</span>
        </div>
      </Paper>

      {/* Persisted Groups Section — Apple Glass Table */}
      <Paper
        className="surface-panel comparison-history-panel"
        elevation={0}
      >
        <Typography variant="h6" className="comparison-section-title">
{t('comparisonsPage.history', { count: groups.length })}
        </Typography>

        {groups.length === 0 ? (
          <Typography variant="body2" color="text.secondary" align="center" className="comparison-empty">
            {t('comparisonsPage.empty')}
          </Typography>
        ) : (
          <TableContainer className="comparison-table-container">
            <Table size="small" className="comparison-table">
              <TableHead className="comparison-table-head">
                <TableRow>
                  <TableCell className="comparison-table-header-cell comparison-col-question">{t('comparisonsPage.colQuestion')}</TableCell>
                  <TableCell className="comparison-table-header-cell comparison-col-date">{t('comparisonsPage.colDate')}</TableCell>
                  <TableCell className="comparison-table-header-cell comparison-col-strategy-count">{t('comparisonsPage.colStrategyCount')}</TableCell>
                  <TableCell className="comparison-table-header-cell comparison-col-strategies">{t('comparisonsPage.colStrategies')}</TableCell>
                  <TableCell className="comparison-table-header-cell comparison-col-document">{t('comparisonsPage.colDocument')}</TableCell>
                  <TableCell className="comparison-table-header-cell comparison-col-decision">{t('comparisonsPage.colDecision')}</TableCell>
                  <TableCell align="right" className="comparison-table-header-cell comparison-col-actions">{t('comparisonsPage.colActions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groups.map((group) => {
                  const status = group.synthesis_status || 'invalid'
                  const isSelected = selectedGroup?.comparison_group_id === group.comparison_group_id
                  return (
                    <TableRow
                      key={group.comparison_group_id}
                      hover
                      selected={isSelected}
                      className="comparison-row"
                    >
                      <TableCell className="comparison-cell-question">
                        <Tooltip title={group.question} placement="top-start" arrow classes={{ tooltip: 'comparison-question-tooltip', arrow: 'comparison-question-tooltip-arrow' }}>
                          <span className="comparison-question-preview">{group.question}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="comparison-cell-date">
                        <span className="comparison-date-stack">
                          <strong>{formatHistoryDate(group.created_at, locale).time}</strong>
                          <small>{formatHistoryDate(group.created_at, locale).date}</small>
                        </span>
                      </TableCell>
                      <TableCell>{group.strategies.length}</TableCell>
                      <TableCell className="comparison-cell-strategies">
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" className="comparison-strategy-stack">
                          {group.strategies.map((s) => (
                            <Tooltip key={s} title={`${strategyHumanLabel(s)} (${s})`}><Chip label={strategyCompactLabel(s)} size="small" variant="outlined" className="comparison-small-chip" /></Tooltip>
                          ))}
                        </Stack>
                      </TableCell>
                      <TableCell className="comparison-cell-document">
                        {(group.documents || []).length ? (
                          <Tooltip
                            title={<span className="comparison-document-tooltip-list">{group.documents.map((document, index) => <span key={`${document}-${index}`}>D{index + 1} — {document}</span>)}</span>}
                            placement="top-start"
                            arrow
                            classes={{ tooltip: 'comparison-question-tooltip', arrow: 'comparison-question-tooltip-arrow' }}
                          >
                            <span className="comparison-document-summary">
                              {t((group.documents || []).length === 1 ? 'comparisonsPage.documentCountSingular' : 'comparisonsPage.documentCountPlural', { count: group.documents.length })}
                            </span>
                          </Tooltip>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {status === 'valid' ? (
<Chip size="small" label={t('comparisonsPage.statusValid')} className="comparison-status-chip is-valid" icon={<CheckCircleIcon fontSize="small" />} />
                        ) : status === 'partial' ? (
                          <Chip size="small" label={t('comparisonsPage.statusPartial')} className="comparison-status-chip is-partial" icon={<WarningIcon fontSize="small" />} />
                        ) : (
                          <Chip size="small" label={t('comparisonsPage.statusInvalid')} className="comparison-status-chip is-invalid" icon={<ErrorIcon fontSize="small" />} />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.25} justifyContent="flex-end" className="comparison-row-actions">
                          <Button size="small" variant="contained" aria-label={t('comparisonsPage.inspectAria')} onClick={() => loadDetail(group.comparison_group_id)} className="comparison-row-action">
{t('comparisonsPage.inspect')}
                          </Button>
                          <Tooltip title={t('comparisonsPage.reportTitle')}>
                            <IconButton size="small" aria-label={t('comparisonsPage.reportAria')} onClick={() => loadReport(group.comparison_group_id)} className="comparison-icon-action">
                            <DescriptionIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('comparisonsPage.deleteTitle')}>
                            <IconButton
                              size="small"
                              color="error"
                              aria-label={t('comparisonsPage.deleteAria')}
                              onClick={() => setDeleteTarget(group)}
                              className="comparison-icon-action comparison-delete-action"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog
        open={Boolean(markdownReport)}
        onClose={() => { setMarkdownReport(''); setShowRawReport(false) }}
        fullWidth
        maxWidth="lg"
        PaperProps={{ className: 'comparison-report-dialog' }}
        aria-labelledby="comparison-report-dialog-title"
      >
        <DialogTitle id="comparison-report-dialog-title" className="comparison-report-dialog-title">
          <span>{t('comparisonsPage.reportHeading')}</span>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button size="small" startIcon={<DescriptionIcon />} onClick={() => setShowRawReport((value) => !value)}>
              {showRawReport ? t('comparisonsPage.showRenderedReport') : t('comparisonsPage.showRawReport')}
            </Button>
            <IconButton onClick={() => { setMarkdownReport(''); setShowRawReport(false) }} aria-label={t('comparisonsPage.closeReportAria')}>
              <CloseIcon />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent className="comparison-report-dialog-content">
          {showRawReport ? <pre className="comparison-report-pre">{visibleMarkdownReport}</pre> : <MarkdownContent className="comparison-report-markdown">{visibleMarkdownReport}</MarkdownContent>}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={closeDeleteDialog}
        fullWidth
        maxWidth="sm"
        aria-labelledby="comparison-delete-dialog-title"
      >
        <DialogTitle id="comparison-delete-dialog-title">
          {t('comparisonsPage.deleteHeading')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Typography variant="body1">
              {t('comparisonsPage.deleteQuestion')}
            </Typography>
            {deleteTarget ? (
              <Paper variant="outlined" className="comparison-delete-summary">
                <Typography variant="body2" className="comparison-delete-summary-question">
                  {deleteTarget.question}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('comparisonsPage.deleteSummary', {
                    date: formatHistoryDate(deleteTarget.created_at, locale).date,
                    strategies: deleteTarget.strategies.length,
                    documents: deleteTarget.documents.length,
                  })}
                </Typography>
              </Paper>
            ) : null}
            <Alert severity="warning">
              {t('comparisonsPage.deleteWarning')}
            </Alert>
          </Stack>
        </DialogContent>
        <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeDeleteDialog} disabled={Boolean(deletingGroupId)}>
            {t('comparisonsPage.deleteCancel')}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={onDeleteConfirmed}
            disabled={Boolean(deletingGroupId)}
            startIcon={deletingGroupId ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
          >
            {deletingGroupId ? t('comparisonsPage.deleteProcessing') : t('comparisonsPage.deleteConfirm')}
          </Button>
        </Stack>
      </Dialog>

      <Dialog fullScreen hideBackdrop open={Boolean(selectedGroup)} onClose={closeDetail} PaperProps={{ className: 'comparison-detail-dialog' }}>
        <DialogTitle className="comparison-detail-dialog-head">
          <Button startIcon={<ArrowBackIcon />} onClick={closeDetail} className="comparison-back-button">{t('comparisonsPage.backToHistory')}</Button>
        </DialogTitle>
        <DialogContent className="comparison-detail-dialog-content">
          <ComparisonDetailGrid group={selectedGroup} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

