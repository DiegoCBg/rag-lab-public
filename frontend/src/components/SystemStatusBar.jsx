import { useQuery } from '@tanstack/react-query'
import { Box, Stack, Tooltip, Typography } from '@mui/material'
import StorageIcon from '@mui/icons-material/Storage'
import MemoryIcon from '@mui/icons-material/Memory'
import DnsIcon from '@mui/icons-material/Dns'
import DescriptionIcon from '@mui/icons-material/Description'
import { api } from '../api/client'
import { useI18n } from '../i18n'
import { parseSystemStatus } from '../types/contracts'

function StatusDot({ status }) {
  const isOk = status === 'ok' || status === 'available'
  const isErr = status === 'error'
  return <span className={`status-dot ${isOk ? 'ok' : isErr ? 'error' : 'unknown'}`} />
}

function StatusPill({ icon, label, status, detail, tooltip }) {
  const content = (
    <Box
      className="status-pill"
    >
      <StatusDot status={status} />
      <span className="status-pill-icon">{icon}</span>
      <span>{label}</span>
      {detail ? <span className="status-pill-detail">({detail})</span> : null}
    </Box>
  )

  return tooltip ? <Tooltip title={tooltip}>{content}</Tooltip> : content
}

const providerLabels = {
  ollama: 'Ollama',
  openai: 'OpenAI',
  google: 'Google',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
}

export default function SystemStatusBar() {
  const { t } = useI18n()

  const { data, isLoading } = useQuery({
    queryKey: ['system-status'],
    queryFn: async () => parseSystemStatus((await api.get('/system/status')).data),
    refetchInterval: 5000,
    retry: false,
  })

  const activeProvider = data?.documents?.active_provider
  const activeProviderLabel = providerLabels[activeProvider] || activeProvider || '—'
  const activeModel = data?.documents?.active_model
  const chromaStatus = data?.chroma?.status || 'unknown'
  const chromaUnavailable = chromaStatus === 'error'
  const chromaDetail = data?.chroma
    ? chromaUnavailable
      ? 'consultas bloqueadas'
      : `${data.chroma.vector_count} vetores`
    : null

  return (
    <div aria-live="polite"
      className="system-status-bar"
    >
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
        <Typography className="system-status-label">
          {t('systemStatus.label')}
        </Typography>
        <StatusPill icon={<DnsIcon fontSize="inherit" />} label={t('systemStatus.backend')} status={data?.fastapi?.status || (isLoading ? 'loading' : 'error')} detail={data?.fastapi?.latency_ms ? `${data.fastapi.latency_ms} ms` : null} />
        <StatusPill
          icon={<MemoryIcon fontSize="inherit" />}
          label={t('systemStatus.aiServer')}
          status={activeProvider ? 'ok' : (isLoading ? 'loading' : 'unknown')}
          detail={activeProvider ? `${activeProviderLabel} · ${activeModel || '—'}` : null}
        />
        <StatusPill
          icon={<StorageIcon fontSize="inherit" />}
          label={chromaUnavailable ? 'Chroma indisponível' : 'Chroma disponível'}
          status={chromaStatus}
          detail={chromaDetail}
          tooltip={chromaUnavailable ? 'Backend, documentos e configurações continuam acessíveis. Consultas vetoriais ficam bloqueadas até o Chroma voltar.' : 'Armazenamento vetorial disponível para consultas.'}
        />
        <StatusPill icon={<DescriptionIcon fontSize="inherit" />} label={t('systemStatus.indexedDocs')} status="ok" detail={data?.documents ? `${data.documents.indexed}/${data.documents.total}` : '—'} />
      </Stack>
    </div>
  )
}
