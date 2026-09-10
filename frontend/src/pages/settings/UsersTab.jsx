import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { api, apiErrorMessage } from '../../api/client'
import { parseCurrentUser, parseResetPassword, parseUsers } from '../../types/contracts'

export default function UsersTab({ t, showSnack }) {
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [me, setMe] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [form, setForm] = useState({ username: '', email: '', password: '', is_admin: false })
  const [newPassword, setNewPassword] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const [usersRes, meRes] = await Promise.all([api.get('/admin/users'), api.get('/auth/me')])
      setUsers(parseUsers(usersRes.data))
      setMe(parseCurrentUser(meRes.data))
    } catch (err) {
      setError(apiErrorMessage(err, t('settingsPage.users.loadError')))
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setForm({ username: '', email: '', password: '', is_admin: false })
    setDialog({ mode: 'create' })
  }

  const openEdit = (user) => {
    setForm({ username: user.username, email: user.email || '', password: '', is_admin: user.is_admin })
    setDialog({ mode: 'edit', user })
  }

  const onSave = async () => {
    setBusy(true)
    setError('')
    try {
      if (dialog.mode === 'create') {
        await api.post('/admin/users', {
          username: form.username,
          email: form.email || null,
          password: form.password,
          is_admin: form.is_admin,
        })
      } else {
        const patch = { username: form.username.trim(), email: form.email || null, is_admin: form.is_admin }
        if (form.password) patch.password = form.password
        await api.patch(`/admin/users/${dialog.user.id}`, patch)
      }
      setDialog(null)
      showSnack(t('settingsPage.users.saved'))
      await load()
    } catch (err) {
      setError(apiErrorMessage(err, t('settingsPage.users.saveError')))
    } finally {
      setBusy(false)
    }
  }

  const onToggleActive = async (user) => {
    try {
      await api.patch(`/admin/users/${user.id}`, { is_active: !user.is_active })
      await load()
    } catch (err) {
      setError(apiErrorMessage(err, t('settingsPage.users.saveError')))
    }
  }

  const onResetPassword = async (user) => {
    setBusy(true)
    setError('')
    try {
      const response = await api.post(`/admin/users/${user.id}/reset-password`)
      setNewPassword(parseResetPassword(response.data).new_password)
    } catch (err) {
      setError(apiErrorMessage(err, t('settingsPage.users.resetError')))
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (user) => {
    setBusy(true)
    setError('')
    try {
      await api.delete(`/admin/users/${user.id}`)
      showSnack(t('settingsPage.users.deleted'))
      await load()
    } catch (err) {
      setError(apiErrorMessage(err, t('settingsPage.users.deleteError')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3, gap: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>{t('settingsPage.users.title')}</Typography>
        <Button variant="contained" onClick={openCreate}>{t('settingsPage.users.create')}</Button>
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert> : null}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('settingsPage.users.colUsername')}</TableCell>
              <TableCell>{t('settingsPage.users.colEmail')}</TableCell>
              <TableCell>{t('settingsPage.users.colRole')}</TableCell>
              <TableCell>{t('settingsPage.users.colStatus')}</TableCell>
              <TableCell align="right">{t('settingsPage.users.colActions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>
                  {user.username}
                  {me && user.id === me.id ? <Chip size="small" label={t('settingsPage.users.you')} sx={{ ml: 1, fontSize: '10px' }} /> : null}
                </TableCell>
                <TableCell>{user.email || '-'}</TableCell>
                <TableCell>
                  <Chip size="small" color={user.is_admin ? 'primary' : 'default'} label={user.is_admin ? t('settingsPage.users.admin') : t('settingsPage.users.user')} />
                </TableCell>
                <TableCell>
                  <Chip size="small" color={user.is_active ? 'success' : 'error'} label={user.is_active ? t('settingsPage.users.active') : t('settingsPage.users.inactive')} />
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Button size="small" variant="outlined" onClick={() => openEdit(user)}>{t('settingsPage.users.edit')}</Button>
                    <Button size="small" variant="outlined" onClick={() => onResetPassword(user)}>{t('settingsPage.users.resetPassword')}</Button>
                    <FormControlLabel
                      control={<Switch size="small" checked={user.is_active} onChange={() => onToggleActive(user)} disabled={me && user.id === me.id} />}
                      label={t('settingsPage.users.enabled')}
                      sx={{ m: 0 }}
                    />
                    <Button size="small" variant="text" color="error" onClick={() => onDelete(user)} disabled={me && user.id === me.id}>{t('settingsPage.users.delete')}</Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(dialog)} onClose={() => setDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{dialog?.mode === 'create' ? t('settingsPage.users.create') : t('settingsPage.users.edit')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label={t('settingsPage.users.colUsername')} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} size="small" />
            <TextField label={t('settingsPage.users.colEmail')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} size="small" />
            <TextField
              label={dialog?.mode === 'create' ? t('settingsPage.users.password') : t('settingsPage.users.newPasswordIfAny')}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              size="small"
              helperText={dialog?.mode === 'edit' ? t('settingsPage.users.passwordHint') : null}
            />
            <FormControlLabel
              control={<Switch checked={form.is_admin} onChange={(e) => setForm({ ...form, is_admin: e.target.checked })} />}
              label={t('settingsPage.users.isAdmin')}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={onSave} disabled={busy || !form.username.trim() || (dialog?.mode === 'create' && !form.password)}>
            {busy ? t('common.saving') : t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(newPassword)} onClose={() => setNewPassword(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('settingsPage.users.resetPassword')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('settingsPage.users.newPasswordNote')}</DialogContentText>
          <Box sx={{ mt: 2, p: 2, borderRadius: 2, background: 'var(--ui-surface-2)', fontFamily: 'monospace', fontSize: '16px', textAlign: 'center', wordBreak: 'break-all' }}>
            {newPassword}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setNewPassword(null)}>{t('settingsPage.users.done')}</Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
