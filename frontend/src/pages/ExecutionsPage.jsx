import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Chip, Paper, Typography } from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import { api } from '../api/client'
import { useI18n } from '../i18n'
import { parseExecutions } from '../types/contracts'

export default function ExecutionsPage() {
  const { t } = useI18n()
  const { data: executions = [], isLoading, isError } = useQuery({
    queryKey: ['executions'],
    queryFn: async () => parseExecutions((await api.get('/executions')).data),
  })

  const columns = useMemo(() => [
    { field: 'id', headerName: '#', flex: 0.3, minWidth: 60 },
    { field: 'created_at', headerName: t('executionsPage.colDate'), flex: 1, minWidth: 160, valueFormatter: (value) => value ? new Date(value).toLocaleString() : '—' },
    { field: 'strategy', headerName: t('executionsPage.colStrategy'), flex: 0.8, minWidth: 110, renderCell: (params) => <Chip size="small" variant="outlined" label={params.value} sx={{ fontSize: '11px', fontWeight: 600 }} /> },
    { field: 'provider', headerName: t('executionsPage.colProvider'), flex: 0.7, minWidth: 100 },
    { field: 'generation_model', headerName: t('executionsPage.colModel'), flex: 1, minWidth: 140 },
    { field: 'question', headerName: t('executionsPage.colQuestion'), flex: 2.2, minWidth: 240 },
    { field: 'answer_preview', headerName: t('executionsPage.colAnswer'), flex: 1.5, minWidth: 180 },
    { field: 'sources', headerName: t('executionsPage.colSources'), flex: 0.6, minWidth: 80, renderCell: (params) => params.value?.length ? t('executionsPage.sourcesCount', { count: params.value.length }) : '—' },
  ], [t])

  return (
    <div className="page-content executions-page">
      <header className="page-header compact page-header-snug">
        <div>
          <Typography variant="h4" className="page-title-strong">{t('executionsPage.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('executionsPage.subtitle')}</Typography>
        </div>
      </header>

      {isError ? <Alert severity="error" className="industrial-error">{t('executionsPage.loadError')}</Alert> : null}

      <Paper elevation={0} className="transparent-panel">
        <div className="executions-history-table">
          <DataGrid
            rows={executions}
            columns={columns}
            loading={isLoading}
            density="standard"
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
            disableRowSelectionOnClick
            localeText={{ noRowsLabel: t('executionsPage.empty') }}
          />
        </div>
      </Paper>
    </div>
  )
}
