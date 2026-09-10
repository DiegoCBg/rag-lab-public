import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress, MenuItem, Paper, TextField, Tooltip, Typography } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import RefreshIcon from '@mui/icons-material/Refresh'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import VisibilityIcon from '@mui/icons-material/Visibility'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import { DataGrid } from '@mui/x-data-grid'
import { api, apiErrorMessage } from '../api/client'
import { useI18n } from '../i18n'
import { parseDocuments, parseIngestionJob } from '../types/contracts'

function statusColor(status) {
  if (status === 'indexed') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'processing') return 'warning'
  return 'default'
}

export default function DocumentsPage() {
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const fileRef = useRef(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [error, setError] = useState('')
  const [job, setJob] = useState(null)

  const documentsQuery = useQuery({
    queryKey: ['documents'],
    queryFn: async () => parseDocuments((await api.get('/documents')).data),
  })
  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const data = new FormData()
      data.append('file', file)
      return parseIngestionJob((await api.post('/documents/ingestions', data)).data)
    },
    onSuccess: (data) => { setJob(data); setError(''); queryClient.invalidateQueries({ queryKey: ['documents'] }); if (fileRef.current) fileRef.current.value = '' },
    onError: (err) => setError(apiErrorMessage(err, t('documentsPage.uploadError'))),
  })
  const deleteMutation = useMutation({
    mutationFn: async (id) => (await api.delete(`/documents/${id}`)).data,
    onSuccess: () => { setToDelete(null); setSelected(null); queryClient.invalidateQueries({ queryKey: ['documents'] }) },
    onError: (err) => setError(apiErrorMessage(err, t('documentsPage.deleteError'))),
  })
  const reindexMutation = useMutation({
    mutationFn: async (id) => (await api.post(`/documents/${id}/reindex`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
    onError: (err) => setError(apiErrorMessage(err, t('documentsPage.reindexError'))),
  })

  const documents = documentsQuery.data || []
  const filtered = useMemo(() => documents.filter((doc) => {
    const queryMatch = !search || doc.filename.toLowerCase().includes(search.toLowerCase())
    const typeMatch = typeFilter === 'all' || doc.content_type === typeFilter
    const statusMatch = statusFilter === 'all' || doc.status === statusFilter
    return queryMatch && typeMatch && statusMatch
  }), [documents, search, typeFilter, statusFilter])
  const metrics = useMemo(() => ({
    total: documents.length,
    indexed: documents.filter((doc) => doc.status === 'indexed').length,
    processing: documents.filter((doc) => ['uploaded', 'processing'].includes(doc.status)).length,
    failed: documents.filter((doc) => doc.status === 'failed').length,
    chunks: documents.reduce((sum, doc) => sum + (doc.chunk_count || 0), 0),
  }), [documents])
  const columns = [
    { field: 'filename', headerName: t('documentsPage.colFilename'), flex: 1, minWidth: 240 },
    { field: 'content_type', headerName: t('documentsPage.colType'), width: 150 },
    { field: 'status', headerName: t('documentsPage.colStatus'), width: 120, renderCell: ({ value }) => <Chip size="small" color={statusColor(value)} label={value} /> },
    { field: 'chunk_count', headerName: t('documentsPage.colChunks'), width: 110 },
    { field: 'created_at', headerName: t('documentsPage.colDate'), width: 170, valueFormatter: (value) => value ? new Date(value).toLocaleString() : '—' },
    { field: 'actions', headerName: t('documentsPage.colActions'), width: 130, sortable: false, renderCell: ({ row }) => <div><Tooltip title={t('documentsPage.open')}><IconButton size="small" onClick={() => setSelected(row)}><VisibilityIcon fontSize="small" /></IconButton></Tooltip><Tooltip title={t('documentsPage.reindex')}><IconButton size="small" onClick={() => reindexMutation.mutate(row.id)}><RefreshIcon fontSize="small" /></IconButton></Tooltip><Tooltip title={t('documentsPage.delete')}><IconButton size="small" onClick={() => setToDelete(row)}><DeleteIcon fontSize="small" /></IconButton></Tooltip></div> },
  ]

  return <div className="page-content documents-page" aria-busy={uploadMutation.isPending}>
    {error ? <Alert severity="error">{error}</Alert> : null}
    <div className="documents-top-row"><div className="documents-title-block"><h1>{t('documentsPage.title')}</h1><p>{t('documentsPage.subtitle')}</p><Paper className="surface-panel document-command-bar" elevation={0}>
      <TextField fullWidth size="small" placeholder={t('documentsPage.searchPlaceholder')} value={search} onChange={(event) => setSearch(event.target.value)} InputProps={{ startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} /> }} />
      <TextField select size="small" label={t('documentsPage.typeLabel')} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><MenuItem value="all">{t('documentsPage.allTypes')}</MenuItem><MenuItem value="application/pdf">PDF</MenuItem><MenuItem value="text/plain">TXT</MenuItem><MenuItem value="text/markdown">Markdown</MenuItem></TextField>
      <TextField select size="small" label={t('documentsPage.statusLabel')} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><MenuItem value="all">{t('documentsPage.allStatuses')}</MenuItem><MenuItem value="uploaded">{t('documentsPage.statusUploaded')}</MenuItem><MenuItem value="processing">{t('documentsPage.statusProcessing')}</MenuItem><MenuItem value="indexed">{t('documentsPage.statusIndexed')}</MenuItem><MenuItem value="failed">{t('documentsPage.statusFailed')}</MenuItem></TextField>
      <Button component="label" variant="contained" startIcon={<UploadFileIcon />} disabled={uploadMutation.isPending}>{uploadMutation.isPending ? t('documentsPage.uploading') : t('documentsPage.upload')}<input hidden ref={fileRef} type="file" accept=".pdf,.txt,.md,.docx,.doc" onChange={(event) => event.target.files?.[0] && uploadMutation.mutate(event.target.files[0])} /></Button>
    </Paper></div><aside className="documents-metrics-strip"><h2 className="documents-metrics-title">{t('documentsPage.metrics')}</h2><div className="documents-metrics-grid">{[['documentsPage.metricTotal', metrics.total], ['documentsPage.metricIndexed', metrics.indexed], ['documentsPage.metricProcessing', metrics.processing], ['documentsPage.metricFailed', metrics.failed], ['documentsPage.metricChunks', metrics.chunks]].map(([label, value]) => <Paper className="document-metric-item" elevation={0} key={label}><Typography variant="caption">{t(label)}</Typography><Typography className="metric-number">{documentsQuery.isLoading ? '...' : value}</Typography></Paper>)}</div></aside></div>
    <Paper className="surface-panel documents-workspace" elevation={0}><div className="document-table"><DataGrid rows={filtered} columns={columns} loading={documentsQuery.isLoading} pageSizeOptions={[25, 50, 100]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} disableRowSelectionOnClick /></div><Typography variant="body2">{t('documentsPage.collectionSummary', { documents: metrics.total, chunks: metrics.chunks })}</Typography></Paper>
    <Dialog open={Boolean(job)} onClose={() => setJob(null)}><DialogTitle>{t('documentsPage.processingUploadTitle')}</DialogTitle><DialogContent><LinearProgress /><Typography sx={{ mt: 2 }}>{job?.document?.filename || ''}</Typography><Typography variant="body2">{job?.status === 'completed' ? t('documentsPage.ingestionCompleted') : t('documentsPage.ingestionInProgress')}</Typography></DialogContent><DialogActions><Button onClick={() => setJob(null)}>OK</Button></DialogActions></Dialog>
    <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="sm" fullWidth><DialogTitle>{selected?.filename}<IconButton onClick={() => setSelected(null)} sx={{ float: 'right' }}><CloseIcon /></IconButton></DialogTitle><DialogContent><pre className="metadata-block">{JSON.stringify(selected, null, 2)}</pre></DialogContent></Dialog>
    <Dialog open={Boolean(toDelete)} onClose={() => setToDelete(null)}><DialogTitle>{t('documentsPage.confirmDeleteTitle')}</DialogTitle><DialogContent><Typography>{toDelete?.filename}</Typography><Typography sx={{ mt: 1 }}>{t('documentsPage.confirmDeleteMessage')}</Typography></DialogContent><DialogActions><Button onClick={() => setToDelete(null)}>{t('documentsPage.cancel')}</Button><Button color="error" variant="contained" onClick={() => deleteMutation.mutate(toDelete.id)}>{t('documentsPage.delete')}</Button></DialogActions></Dialog>
  </div>
}
