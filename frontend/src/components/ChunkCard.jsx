import { Box, Button, Chip, Drawer, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import CodeIcon from '@mui/icons-material/Code'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import { useState } from 'react'
import { useI18n } from '../i18n'

const clampScore = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null
  return Math.max(0, Math.min(1, Number(value)))
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const buildHighlightPattern = (terms) => {
  const uniqueTerms = Array.from(new Set(
    terms
      .map((term) => String(term || '').trim())
      .filter((term) => term.length >= 3)
  ))

  if (!uniqueTerms.length) return null
  return new RegExp(`(${uniqueTerms.map(escapeRegex).join('|')})`, 'i')
}

function HighlightedText({ text, terms }) {
  const pattern = buildHighlightPattern(terms)
  if (!pattern) return text

  return String(text).split(pattern).map((part, index) => {
    if (!part) return null
    return pattern.test(part)
      ? <mark className="chunk-highlight" key={`${part}-${index}`}>{part}</mark>
      : part
  })
}

export default function ChunkCard({ chunk, expanded = false, selected = false, density = 'compact', showRawMetadata = false, highlightTerms = [] }) {
  const [open, setOpen] = useState(Boolean(expanded))
  const [copied, setCopied] = useState(false)
  const { t } = useI18n()
  const score = clampScore(chunk?.score)
  const filename = chunk?.filename || chunk?.metadata?.filename || t('chunkCard.noFilename')
  const rank = chunk?.rank || 0

  const vectorScore = clampScore(chunk?.vectorScore ?? chunk?.metadata?.vector_score)
  const lexicalScore = clampScore(chunk?.lexicalScore ?? chunk?.metadata?.lexical_score)

  const handleCopy = () => {
    if (chunk?.text) {
      navigator.clipboard.writeText(chunk.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Paper className="chunk-card surface-panel" data-selected={selected} data-density={density} elevation={0}>
      <div className="chunk-card-header">
        <Stack direction="row" spacing={1} alignItems="center" minWidth={0}>
          <Chip size="small" label={`#${rank}`} className="chunk-rank-chip" />
          <Typography className="chunk-title" title={filename}>{filename}</Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Typography className="chunk-score-label">
            {score === null ? t('chunkCard.noScore') : t('chunkCard.score', { score: score.toFixed(2) })}
          </Typography>
          <Tooltip title={copied ? t('chunkCard.copied') : t('chunkCard.copySnippet')}>
            <IconButton size="small" onClick={handleCopy} aria-label={t('chunkCard.copyTextAria')}>
              {copied ? <CheckIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title={t('chunkCard.metadataTitle')}>
            <IconButton size="small" onClick={() => setOpen(true)} aria-label={t('chunkCard.openMetadataAria')}>
              <CodeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </div>

      <div className="chunk-score-track" aria-label={t('chunkCard.scoreNormalized')}>
        <div className="chunk-score-fill" style={{ width: `${score === null ? 0 : score * 100}%` }} />
      </div>

      {(vectorScore !== null || lexicalScore !== null) && (
        <Stack direction="row" spacing={1} className="chunk-score-row">
          {vectorScore !== null && <Chip size="small" variant="outlined" label={t('chunkCard.vectorScore', { score: vectorScore.toFixed(2) })} className="chunk-score-chip" />}
          {lexicalScore !== null && <Chip size="small" variant="outlined" label={t('chunkCard.lexicalScore', { score: lexicalScore.toFixed(2) })} className="chunk-score-chip" />}
        </Stack>
      )}

      <Typography className="chunk-text">
        <HighlightedText text={chunk?.text || t('chunkCard.noText')} terms={highlightTerms} />
      </Typography>

      <Stack direction="row" spacing={1} className="chunk-meta" flexWrap="wrap">
        {(chunk?.chunkIndex ?? chunk?.chunk_index) !== undefined && (chunk?.chunkIndex ?? chunk?.chunk_index) !== null ? <Chip size="small" label={t('chunkCard.chunkNumber', { number: chunk.chunkIndex ?? chunk.chunk_index })} variant="outlined" /> : null}
      </Stack>

      <Drawer anchor="right" open={open} onClose={() => setOpen(false)} PaperProps={{ className: 'detail-drawer chunk-card-detail' }}>
        <div className="drawer-head">
          <div>
            <Typography variant="h6" className="chunk-drawer-title">{t('chunkCard.inspectTitle', { rank })}</Typography>
            <Typography variant="caption" color="text.secondary">{filename}</Typography>
          </div>
          <IconButton onClick={() => setOpen(false)} aria-label={t('chunkCard.closeDetailAria')}><CloseIcon /></IconButton>
        </div>

        <Box className="drawer-inspection-card">
          <Typography variant="subtitle2" className="drawer-section-title accent">{t('chunkCard.fullContent')}:</Typography>
          <Typography className="drawer-text drawer-text--compact">
            <HighlightedText text={chunk?.text || ''} terms={highlightTerms} />
          </Typography>
        </Box>

        <Typography variant="subtitle2" className="drawer-section-title">{t('chunkCard.rawMetadata')}:</Typography>
        <pre className="metadata-block metadata-block--inverse chunk-metadata-block">
          {JSON.stringify(showRawMetadata ? chunk : chunk?.metadata || {}, null, 2)}
        </pre>

        <Button variant="contained" onClick={() => setOpen(false)} fullWidth className="drawer-finish-button">
          {t('chunkCard.finishInspection')}
        </Button>
      </Drawer>
    </Paper>
  )
}

