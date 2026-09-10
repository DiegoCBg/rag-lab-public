import { Paper, Stack, Typography } from '@mui/material'
import { useI18n } from '../i18n'

const value = (tokens) => tokens === null || tokens === undefined ? 'Não informado' : tokens.toLocaleString('pt-BR')

export default function TokenUsagePanel({ usage, title }) {
  const { t } = useI18n()
  const breakdown = usage?.breakdown || {}
  if (!usage) {
    return (
      <Paper className="token-usage-panel" elevation={0} data-testid="token-usage-panel">
        <Typography variant="subtitle2">{title || t('tokenUsage.title')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('tokenUsage.notRegistered')}</Typography>
      </Paper>
    )
  }
  return (
    <Paper className="token-usage-panel" elevation={0} data-testid="token-usage-panel">
      <Typography variant="subtitle2">{title || t('tokenUsage.title')}</Typography>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <Typography variant="body2">{t('tokenUsage.total')}: <strong>{value(usage.total_tokens)}</strong></Typography>
        {breakdown.generation ? <Typography variant="body2">{t('tokenUsage.generation')}: <strong>{value(breakdown.generation.total_tokens)}</strong></Typography> : null}
        {breakdown.audit ? <Typography variant="body2">{t('tokenUsage.audit')}: <strong>{value(breakdown.audit.total_tokens)}</strong></Typography> : null}
        {breakdown.synthesis ? <Typography variant="body2">{t('tokenUsage.synthesis')}: <strong>{value(breakdown.synthesis.total_tokens)}</strong></Typography> : null}
        <Typography variant="body2">{t('tokenUsage.calls')}: <strong>{usage.calls ?? 'Não informado'}</strong></Typography>
      </Stack>
      {usage.partial ? <Typography variant="caption" color="text.secondary">{t('tokenUsage.partial')}</Typography> : null}
    </Paper>
  )
}
