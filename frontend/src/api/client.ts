import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

type ErrorDetail = string | { message?: unknown; code?: unknown; issues?: Array<{ document_id?: string; reason?: string }> } | Array<{ msg?: unknown }> | null | undefined
type ErrorResponse = { detail?: ErrorDetail }

const token = (): string | null => {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem('raglab_token')
}

export const api = axios.create({
  baseURL: 'http://127.0.0.1:8000/api',
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const value = token()
  if (value) {
    config.headers.Authorization = `Bearer ${value}`
  }
  return config
})

// Interceptor de response: se receber 401, remove o token e dispara evento global
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token inválido ou expirado: limpa storage e dispara evento
      window.localStorage.removeItem('raglab_token')
      window.localStorage.removeItem('raglab_user')
      window.dispatchEvent(new CustomEvent('auth:unauthenticated'))
    }
    return Promise.reject(error)
  }
)

// Extrai mensagem de erro do backend (lida com detail em array do FastAPI 422)
export const apiErrorMessage = (error: unknown, fallback: string): string => {
  const detail = (error as AxiosError<ErrorResponse>)?.response?.data?.detail
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (typeof item?.msg === 'string' ? item.msg : ''))
      .filter(Boolean)
    return messages.join('. ') || fallback
  }
  if (detail && typeof detail === 'object' && typeof detail.message === 'string' && detail.message) {
    if (Array.isArray(detail.issues) && detail.issues.length) {
      const reasons: Record<string, string> = {
        not_found: 'arquivo indisponível', not_indexed: 'não indexado', filter_mismatch: 'conflito com os filtros',
        embedding_incompatible: 'embedding incompatível com o provedor ativo',
      }
      return `${detail.message} ${detail.issues.map((issue) => `ID ${issue.document_id}: ${reasons[issue.reason || ''] || issue.reason}`).join('; ')}`
    }
    return detail.message
  }
  return typeof detail === 'string' && detail ? detail : fallback
}

// Função para verificar se há token
export const hasToken = (): boolean => !!token()

// Função para remover token programaticamente
export const removeToken = () => {
  window.localStorage.removeItem('raglab_token')
  window.localStorage.removeItem('raglab_user')
  window.dispatchEvent(new CustomEvent('auth:unauthenticated'))
}
