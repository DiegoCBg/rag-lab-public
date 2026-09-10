import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, apiErrorMessage } from '../api/client'
import { useI18n } from '../i18n'
import LocaleSwitcher from '../components/LocaleSwitcher'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [form, setForm] = useState({ username: '', password: '', email: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const onChange = (event) => setForm({ ...form, [event.target.name]: event.target.value })

  const onRegister = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsSubmitting(true)
    try {
      await api.post('/auth/register', form)
      setMessage(t('register.successMessage'))
      setTimeout(() => navigate('/login'), 600)
    } catch (err) {
      setError(apiErrorMessage(err, t('register.fail')))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="page auth-page">
      <div className="auth-locale-switcher"><LocaleSwitcher /></div>
      <div className="card auth-card">
        <h1>{t('register.title')}</h1>
        <p>{t('register.subtitle')}</p>
        <form onSubmit={onRegister} className="form-grid">
          <input name="username" placeholder={t('login.username')} value={form.username} onChange={onChange} />
          <input name="email" type="email" placeholder={t('register.email')} value={form.email} onChange={onChange} />
          <input name="password" type="password" placeholder={t('login.password')} value={form.password} onChange={onChange} />
          {message ? <div className="success-box">{message}</div> : null}
          {error ? <div className="error-box">{error}</div> : null}
          <button type="submit">{t('login.registerLink')}</button>
        </form>
        <p className="muted-line">{t('register.haveAccount')} <Link to="/login">{t('login.submit')}</Link></p>
      </div>
    </div>
  )
}
