import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { en } from './en'
import { ptBR } from './ptBR'

type LocaleId = 'pt-BR' | 'en'
type Messages = Record<string, string>
type MessageParams = Record<string, unknown>

interface I18nValue {
  t: (key: string, params?: MessageParams) => string
  locale: LocaleId
  setLocale: (next: string) => void
  messages: Messages
}

export const LOCALES: Record<LocaleId, { label: string; messages: Messages }> = {
  'pt-BR': { label: 'Português (Brasil)', messages: ptBR },
  en: { label: 'English', messages: en },
}

export const DEFAULT_LOCALE: LocaleId = 'pt-BR'

const I18nContext = createContext<I18nValue | null>(null)

const STORAGE_KEY = 'raglab_locale'

function isLocale(value: string): value is LocaleId {
  return value in LOCALES
}

function readInitialLocale(): LocaleId {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && isLocale(stored)) return stored
  } catch {
    /* ignore */
  }
  const browser = window.navigator?.language?.toLowerCase?.()
  if (browser && browser.startsWith('pt')) return 'pt-BR'
  return DEFAULT_LOCALE
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState(readInitialLocale)

  const setLocale = useCallback((next: string) => {
    const value: LocaleId = isLocale(next) ? next : DEFAULT_LOCALE
    setLocaleState(value)
    try {
      window.localStorage.setItem(STORAGE_KEY, value)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dataset.locale = locale
  }, [locale])

  const value = useMemo(() => {
    const messages = LOCALES[locale].messages
    const t = (key: string, params?: MessageParams) => {
      let text = messages[key] ?? LOCALES[DEFAULT_LOCALE].messages[key] ?? key
      if (params) {
        Object.entries(params).forEach(([name, val]) => {
          text = text.split(`{{${name}}}`).join(String(val))
        })
      }
      return text
    }
    return { t, locale, setLocale, messages }
  }, [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    // Fallback fora de provider (testes, ambientes não reativos): pt-BR estático.
    const messages = LOCALES[DEFAULT_LOCALE].messages
    return {
      t: (key: string, params?: MessageParams) => translate(DEFAULT_LOCALE, key, params),
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      messages,
    }
  }
  return ctx
}

// Substitui placeholders fora de componentes (ex.: dicionários de labels de status).
export function translate(locale: string, key: string, params?: MessageParams): string {
  const messages = (isLocale(locale) ? LOCALES[locale] : LOCALES[DEFAULT_LOCALE]).messages
  let text = messages[key] ?? LOCALES[DEFAULT_LOCALE].messages[key] ?? key
  if (params) {
    Object.entries(params).forEach(([name, val]) => {
      text = text.split(`{{${name}}}`).join(String(val))
    })
  }
  return text
}
