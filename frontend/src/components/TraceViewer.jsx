import { Chip, Paper, Stack, Typography } from '@mui/material'
import { useI18n } from '../i18n'

export default function TraceViewer({ events = [], orientation = 'vertical', connectorWidth = 2, activeEventId = null }) {
  const { t } = useI18n()

  if (!events.length) return <Paper className="empty-panel" elevation={0}>{t('traceViewer.empty')}</Paper>

  return (
    <div className="trace-timeline" data-orientation={orientation} style={{ '--trace-connector-width': `${connectorWidth}px` }}>
      {events.map((event, index) => (
        <Paper className="trace-node" data-active={activeEventId === event.id} elevation={0} key={event.id || index}>
          <div className="trace-marker" />
          <div className="trace-content">
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Typography className="trace-label">{event.label || event.stage}</Typography>
              {event.stage ? <Chip size="small" label={event.stage} /> : null}
              {event.status ? <Chip size="small" color={event.status === 'failed' ? 'error' : 'default'} label={event.status} /> : null}
              {event.durationMs !== null && event.durationMs !== undefined ? <Chip size="small" label={`${event.durationMs} ms`} /> : null}
            </Stack>
            {event.query ? <Typography className="trace-query">{event.query}</Typography> : null}
            {event.count !== null && event.count !== undefined ? <Typography className="trace-detail">{t('traceViewer.chunks')}: {event.count}</Typography> : null}
            {event.errorCode ? <Typography className="trace-error">{event.errorCode}</Typography> : null}
          </div>
        </Paper>
      ))}
    </div>
  )
}
