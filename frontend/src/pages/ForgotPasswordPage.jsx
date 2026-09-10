import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, apiErrorMessage } from '../api/client'
import { useI18n } from '../i18n'
import LocaleSwitcher from '../components/LocaleSwitcher'
import { parseResetPassword } from '../types/contracts'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [username, setUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const onSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const response = await api.post('/auth/forgot-password', { username })
      setNewPassword(parseResetPassword(response.data).new_password)
    } catch (err) {
      setError(apiErrorMessage(err, t('forgotPassword.fail')))
    } finally {
      setIsSubmitting(false)
    }
  }

  const onDone = () => navigate('/login')

  return (
    <div className="page auth-page">
      <div className="auth-locale-switcher"><LocaleSwitcher /></div>
      <div className="card auth-card">
        <h1>{t('forgotPassword.title')}</h1>
        <p>{t('forgotPassword.subtitle')}</p>
        {!newPassword ? (
          <form onSubmit={onSubmit} className="form-grid">
            <input name="username" placeholder={t('login.username')} value={username} onChange={(event) => setUsername(event.target.value)} />
            {error ? <div className="error-box">{error}</div> : null}
            <button type="submit" disabled={isSubmitting || !username.trim()}>
              {isSubmitting ? t('forgotPassword.generating') : t('forgotPassword.generate')}
            </button>
          </form>
        ) : (
          <div className="form-grid">
            <div className="warning-box auth-password-box">
              <strong>{t('forgotPassword.newPassword')}:</strong>
              <code className="auth-password-code">{newPassword}</code>
            </div>
            <p className="muted-line">{t('forgotPassword.note')}</p>
            <button type="button" onClick={onDone}>{t('forgotPassword.goLogin')}</button>
          </div>
        )}
      </div>
    </div>
  )
}
