import { createContext, useContext, useState, useEffect, useCallback } from 'react'

import { api } from '../../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null)
  const [username, setUsername] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const clearSession = useCallback(() => {
    window.localStorage.removeItem('raglab_token')
    window.localStorage.removeItem('raglab_user')
    setToken(null)
    setUsername(null)
  }, [])

  const logout = useCallback(async () => {
    const storedToken = window.localStorage.getItem('raglab_token')
    if (storedToken) {
      try {
        await api.post('/auth/logout')
      } catch {
        // A sessão local deve ser limpa mesmo se o token já expirou ou a rede falhou.
      }
    }
    clearSession()
  }, [clearSession])

  useEffect(() => {
    // Carregar token do localStorage ao inicializar
    const storedToken = window.localStorage.getItem('raglab_token')
    if (storedToken) {
      setToken(storedToken)
      // Extrair username do payload do JWT (segundo segmento)
      try {
        const payload = storedToken.split('.')[1]
        if (payload) {
          const decoded = JSON.parse(atob(payload))
          setUsername(decoded.sub || decoded.username || 'user')
        }
      } catch {
        // Se não conseguir decodificar, apenas usa o token
      }
    }
    setIsLoading(false)
  }, [])

  // Sessão expirada/inválida: interceptor dispara o evento → limpa estado globalmente
  useEffect(() => {
    const onUnauthenticated = () => clearSession()
    window.addEventListener('auth:unauthenticated', onUnauthenticated)
    return () => window.removeEventListener('auth:unauthenticated', onUnauthenticated)
  }, [clearSession])

  const login = useCallback((tokenValue) => {
    window.localStorage.setItem('raglab_token', tokenValue)
    setToken(tokenValue)
    try {
      const payload = tokenValue.split('.')[1]
      if (payload) {
        const decoded = JSON.parse(atob(payload))
        setUsername(decoded.sub || decoded.username || 'user')
      }
    } catch {
      setUsername('user')
    }
  }, [])

  const value = {
    token,
    username,
    isLoading,
    isAuthenticated: !!token,
    login,
    logout,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
