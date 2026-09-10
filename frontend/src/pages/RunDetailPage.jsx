import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, Paper, Typography } from '@mui/material'
import { api } from '../api/client'
import ChunkCard from '../components/ChunkCard'
import MetricsPanel from '../components/MetricsPanel'
import ResponseDiffViewer from '../components/ResponseDiffViewer'
import TraceViewer from '../components/TraceViewer'
import { useI18n } from '../i18n'
import { parseRagRun } from '../types/contracts'

export default function RunDetailPage() {
  const { runId } = useParams()
  const { t } = useI18n()
  const { data: run, isLoading, error } = useQuery({ queryKey: ['run', runId], queryFn: async () => parseRagRun((await api.get(`/rag/runs/${runId}`)).data), retry: false })
  const primary = run?.results?.[0]
  const secondary = run?.results?.[1]
  const highlightTerms = useMemo(
    () => String(run?.question || '').split(/\s+/).map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, '')).filter((term) => term.length >= 3),
    [run?.question]
  )

  return (
    <div className="page-content run-detail-page">
      <header className="page-header compact">
        <div>
          <h1>{t('runDetailPage.title')}</h1>
          <p>{runId}</p>
        </div>
      </header>
      {isLoading ? <Paper className="surface-panel">{t('runDetailPage.loading')}</Paper> : null}
      {error ? <Alert severity="error">{t('runDetailPage.notFound')}</Alert> : null}
      {run ? (
        <>
          <MetricsPanel primary={primary?.metrics || { totalMs: null, retrievalMs: null, llmMs: null, chunkCount: 0, sourceCount: 0 }} secondary={secondary?.metrics || null} loading={false} />
          <Paper className="surface-panel" elevation={0}>
            <Typography variant="h2">{t('runDetailPage.traceTitle')}</Typography>
            <TraceViewer events={run.events} connectorWidth={2} />
          </Paper>
          <Paper className="surface-panel" elevation={0}>
            <Typography variant="h2">{t('runDetailPage.diffTitle')}</Typography>
            <ResponseDiffViewer left={primary?.answer || ''} right={secondary?.answer || ''} />
          </Paper>
          <Paper className="surface-panel" elevation={0}>
            <Typography variant="h2">{t('runDetailPage.chunksTitle')}</Typography>
            <div className="chunk-list">
              {(run.results || []).flatMap((result) => result.chunks || []).map((chunk) => <ChunkCard key={chunk.chunkId || chunk.chunk_id} chunk={chunk} highlightTerms={highlightTerms} />)}
            </div>
          </Paper>
        </>
      ) : null}
    </div>
  )
}
