// Diagnostico para verificar o fluxo de autenticacao sem emitir logs em producao.
export function diagnoseAuth() {
  const token = window.localStorage.getItem('raglab_token')
  const user = window.localStorage.getItem('raglab_user')
  const themeMode = window.localStorage.getItem('raglab_theme_mode')

  return {
    hasToken: Boolean(token),
    hasUser: Boolean(user),
    themeMode,
    isLoginPage: window.location.pathname === '/login',
  }
}
