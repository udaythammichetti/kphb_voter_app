import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { tLabel, transliterateToTe } from '../lib/telugu'

const LocaleContext = createContext(null)

export function LocaleProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('kphp_lang') === 'te' ? 'te' : 'en'
    } catch {
      return 'en'
    }
  })

  const setLanguage = useCallback((next) => {
    const v = next === 'te' ? 'te' : 'en'
    setLang(v)
    try {
      localStorage.setItem('kphp_lang', v)
    } catch {
      /* ignore */
    }
  }, [])

  const t = useCallback((key) => tLabel(key, lang), [lang])

  const value = useMemo(
    () => ({
      lang,
      isTe: lang === 'te',
      setLanguage,
      t,
      transliterateToTe,
    }),
    [lang, setLanguage, t],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider')
  return ctx
}
