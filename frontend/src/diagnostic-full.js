// Diagnostico completo para verificar o fluxo de autenticacao sem emitir logs em producao.
export function diagnoseFullAuth() {
  const token = window.localStorage.getItem('raglab_token')
  const user = window.localStorage.getItem('raglab_user')
  const themeMode = window.localStorage.getItem('raglab_theme_mode')

  return {
    auth: {
      hasToken: Boolean(token),
      hasUser: Boolean(user),
      themeMode,
      isLoginPage: window.location.pathname === '/login',
    },
    location: {
      href: window.location.href,
      pathname: window.location.pathname,
    },
    runtime: {
      hasWindow: typeof window !== 'undefined',
      hasReactGlobal: Boolean(window.React),
    },
  }
}

export function forceLoginNavigation() {
  window.location.href = '/login'
}
