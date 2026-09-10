import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, apiErrorMessage, removeToken } from '../api/client'
import { useAuth } from '../features/auth/AuthContext'
import { useI18n } from '../i18n'
import LocaleSwitcher from '../components/LocaleSwitcher'
import { parseLoginResponse } from '../types/contracts'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { login } = useAuth()
  const { t } = useI18n()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (searchParams.get('fresh') === '1') {
      removeToken()
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const onChange = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  const onLogin = async (event) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const response = await api.post('/auth/login', form)
      login(parseLoginResponse(response.data).access_token)
      navigate('/query')
    } catch (err) {
      setError(apiErrorMessage(err, t('login.fail')))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="page auth-page">
      <div className="auth-locale-switcher"><LocaleSwitcher /></div>
      <img src="/logo.png" alt="" className="auth-side-photo" />
      <div className="card auth-card">
        <p>{t('login.subtitle')}</p>
        <form onSubmit={onLogin} className="form-grid">
          <input name="username" placeholder={t('login.username')} value={form.username} onChange={onChange} />
          <input name="password" type="password" placeholder={t('login.password')} value={form.password} onChange={onChange} />
          {error ? <div className="error-box">{error}</div> : null}
          <button type="submit">{t('login.submit')}</button>
        </form>
        <p className="muted-line">
          {t('login.noAccount')} <Link to="/register">{t('login.registerLink')}</Link>
        </p>
        <p className="muted-line">
          <Link to="/forgot-password">{t('login.forgotPassword')}</Link>
        </p>
      </div>
    </div>
  )
}
