import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, InputAdornment, Paper, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import { api } from '../api/client'
import { parseDocuments } from '../types/contracts'
import { useWorkspaceStore } from '../store/workspace'

export function useDocumentSelection() {
  const store = useWorkspaceStore()
  const query = useQuery({
    queryKey: ['documents'],
    queryFn: async () => parseDocuments((await api.get('/documents')).data),
    staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true, retry: false,
  })
  const documents = query.data || []
  const issue = (doc) => !doc ? 'Arquivo indisponível' : doc.status !== 'indexed' ? `Não indexado (${doc.status})` : ''
  const selected = store.selectedDocumentIds.map((id) => ({ id, doc: documents.find((item) => String(item.id) === id) }))
  const valid = !query.isPending && !query.isFetching && !query.isError && (store.documentScopeMode === 'all'
    ? documents.some((doc) => !issue(doc)) : selected.length > 0 && selected.every(({ doc }) => !issue(doc)))
  return {
    store, documents, selected, issue, valid, loading: query.isPending || query.isFetching, error: query.isError,
    payload: {
      document_scope: store.documentScopeMode,
      document_ids: store.documentScopeMode === 'selected' ? [...store.selectedDocumentIds] : [],
      content_type_filter: null, status_filter: null,
    },
  }
}

export default function DocumentSelector({ selection, disabled = false }) {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draftIds, setDraftIds] = useState([])
  const { store, documents, selected, issue } = selection
  const openSelectionDialog = () => {
    setDraftIds([...store.selectedDocumentIds])
    setSearch('')
    setDialogOpen(true)
  }
  const closeSelectionDialog = () => setDialogOpen(false)
  const handleModeChange = (_, mode) => {
    if (!mode || disabled) return
    if (mode === 'all') {
      store.setDocumentScopeMode('all')
      closeSelectionDialog()
      return
    }
    openSelectionDialog()
  }
  const toggleDraft = (id) => setDraftIds((current) => current.includes(id)
    ? current.filter((value) => value !== id) : [...current, id])

  const filteredDocuments = documents.filter((doc) => doc.filename.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const selectedPreview = selected.slice(0, 2)
  const eligibleCount = documents.filter((doc) => !issue(doc)).length
  const draftSelected = draftIds.map((id) => ({ id, doc: documents.find((item) => String(item.id) === id) }))

  return <>
    <Box component="section" aria-label="Documentos da investigação" className="document-selector">
      <Box className="document-selector-head">
        <Box className="document-selector-heading">
          <Typography variant="subtitle2">Documentos da investigação</Typography>
          <Typography variant="caption" color="text.secondary">
            {store.documentScopeMode === 'all' ? `${eligibleCount} arquivo(s) indexado(s) disponível(is)` : `${selected.length} selecionado(s)`}
          </Typography>
        </Box>
        <ToggleButtonGroup exclusive value={store.documentScopeMode} disabled={disabled} size="small" onChange={handleModeChange}>
          <ToggleButton value="all">Todos</ToggleButton>
          <ToggleButton value="selected">Selecionar</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {store.documentScopeMode === 'selected' && <Box className="document-selection-summary">
        <Box className="document-selection-chips">
          {selectedPreview.map(({ id, doc }) => <Tooltip key={id} title={doc?.filename || `ID ${id}`}>
            <Chip size="small" label={doc?.filename || `ID ${id} indisponível`} color={doc && !issue(doc) ? 'default' : 'warning'} />
          </Tooltip>)}
          {selected.length > selectedPreview.length && <Chip size="small" label={`+${selected.length - selectedPreview.length}`} />}
          {!selected.length && <Typography variant="caption" color="text.secondary">Nenhum arquivo selecionado</Typography>}
        </Box>
        <Button size="small" variant="outlined" disabled={disabled} onClick={openSelectionDialog}>
          Escolher arquivos
        </Button>
      </Box>}
      {selection.error ? <Alert severity="warning">Não foi possível validar a lista de documentos.</Alert>
        : selection.loading ? <Typography variant="caption">Verificando documentos...</Typography>
          : !selection.valid ? <Alert severity="info">Selecione documentos indexados que correspondam ao escopo.</Alert> : null}
    </Box>

    <Dialog open={dialogOpen} onClose={closeSelectionDialog} fullWidth maxWidth="md" aria-labelledby="document-selection-dialog-title">
      <DialogTitle id="document-selection-dialog-title" className="document-selection-dialog-title">
        Selecionar documentos
        <IconButton aria-label="Fechar seleção de documentos" onClick={closeSelectionDialog} edge="end" size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box className="document-selection-dialog-grid">
          <Box className="document-selection-dialog-list">
            <Box className="document-selection-search-row">
              <TextField className="document-selection-search" size="small" label="Buscar arquivo" value={search} disabled={disabled} onChange={(event) => setSearch(event.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
              <Typography variant="caption" color="text.secondary">{filteredDocuments.length} encontrado(s)</Typography>
            </Box>
            <Box className="document-selection-list">
              {draftSelected.filter(({ doc }) => !doc).map(({ id }) => <Box component="label" key={`missing-${id}`} className="document-selection-option">
                <Checkbox size="small" sx={{ p: 0.5 }} checked disabled={disabled} onChange={() => toggleDraft(id)} inputProps={{ 'aria-label': `Arquivo indisponível (ID ${id})` }} />
                <Box className="document-selection-option-copy"><Typography variant="body2">Arquivo indisponível</Typography><Typography variant="caption" color="warning.main">{`ID ${id} · remova para continuar`}</Typography></Box>
              </Box>)}
              {filteredDocuments.length ? filteredDocuments.map((doc) => {
                const id = String(doc.id)
                const checked = draftIds.includes(id)
                const documentIssue = issue(doc)
                return <Box component="label" key={id} className="document-selection-option">
                  <Checkbox size="small" sx={{ p: 0.5, color: 'var(--ui-muted)', '&.Mui-checked': { color: 'var(--ui-accent)' } }} checked={checked} disabled={disabled || (!!documentIssue && !checked)} onChange={() => toggleDraft(id)} inputProps={{ 'aria-label': `${doc.filename} (ID ${id})` }} />
                  <Box className="document-selection-option-copy"><Typography variant="body2">{doc.filename}</Typography><Typography variant="caption" color={documentIssue ? 'warning.main' : 'text.secondary'}>{`ID ${id}${documentIssue ? ` · ${documentIssue}` : ''}`}</Typography></Box>
                </Box>
              }) : <Typography variant="body2" color="text.secondary" className="document-selection-empty">Nenhum arquivo encontrado.</Typography>}
            </Box>
          </Box>
          <Paper variant="outlined" className="document-selection-dialog-summary">
            <Typography variant="subtitle2">Resumo da seleção</Typography>
            <Typography variant="body2">{draftIds.length} arquivo(s) selecionado(s)</Typography>
            <Divider />
            {draftSelected.length ? <Box className="document-selection-dialog-selected-list">
              {draftSelected.map(({ id, doc }) => <Typography key={id} variant="caption" color={doc && !issue(doc) ? 'text.secondary' : 'warning.main'}>{doc?.filename || `ID ${id} indisponível`}</Typography>)}
            </Box> : <Typography variant="caption" color="text.secondary">Escolha pelo menos um arquivo indexado.</Typography>}
            <Typography variant="caption" color="text.secondary">A seleção será aplicada somente ao confirmar.</Typography>
          </Paper>
        </Box>
      </DialogContent>
      <DialogActions className="document-selection-dialog-actions">
        <Button onClick={closeSelectionDialog}>Cancelar</Button>
        <Button variant="contained" onClick={() => { store.setDocumentScopeMode('selected'); store.setSelectedDocumentIds(draftIds); closeSelectionDialog() }}>
          Aplicar seleção
        </Button>
      </DialogActions>
    </Dialog>
  </>
}

export function DocumentScopeDetails({ scope }) {
  return <Box component="details" sx={{ my: 1, overflowWrap: 'anywhere' }}>
    <summary>Documentos da investigação</summary>
    {!scope?.resolved_document_ids ? <Typography variant="body2">Seleção original não registrada</Typography> : <>
      <Typography variant="body2">{scope.mode === 'all' ? 'Todos os documentos elegíveis no início' : 'Documentos selecionados'}</Typography>
      <ul>{scope.resolved_document_ids.map((id, index) => <li key={id}>
        {scope.resolved_document_filenames?.[index] || `ID ${id}`} (ID {id})
        {scope.used_document_ids?.includes(id) ? ' — forneceu evidências' : ''}
      </li>)}</ul>
    </>}
  </Box>
}
