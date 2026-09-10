import { Chip, LinearProgress, Stack, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'

const stages = ['queued', 'embedding', 'retrieval', 'generation', 'semantic_analysis', 'completed']
const labels = {
  queued: 'queue',
  embedding: 'embedding',
  retrieval: 'retrieval',
  generation: 'generation',
  semantic_analysis: 'semantic',
  completed: 'done',
}

export default function PipelineProgress({ activeStage = 'queued', events = [], loading = false }) {
  const { t } = useI18n()
  const [startedAt, setStartedAt] = useState(null)
  const [now, setNow] = useState(Date.now())
  const completed = new Set(events.filter((event) => event.status === 'completed').map((event) => event.stage))

  useEffect(() => {
    if (loading) {
      setStartedAt((current) => current ?? Date.now())
      setNow(Date.now())
      const timer = window.setInterval(() => setNow(Date.now()), 1000)
      return () => window.clearInterval(timer)
    }
    setStartedAt(null)
    return undefined
  }, [loading])

  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0

  return (
    <div className="pipeline-progress">
      {loading ? <LinearProgress /> : null}
      <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
        {stages.map((stage) => {
          const status = completed.has(stage) ? 'completed' : activeStage === stage ? 'running' : 'pending'
          return <Chip key={stage} size="small" label={t(`pipelineProgress.stage.${labels[stage]}`)} className={`pipeline-chip ${status}`} />
        })}
      </Stack>
      <div className="pipeline-meta">
        {activeStage ? <Typography variant="caption" color="text.secondary">{t('pipelineProgress.activeStage', { stage: activeStage })}</Typography> : null}
        {loading ? <Typography variant="caption" className="pipeline-elapsed">{elapsedSeconds}s</Typography> : null}
      </div>
    </div>
  )
}
