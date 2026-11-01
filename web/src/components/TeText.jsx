import { useEffect, useState } from 'react'
import { hasTelugu, transliterateToTe } from '../lib/telugu'
import { useLocale } from '../context/Locale'

/**
 * Shows English by default; in Telugu mode transliterates free-text (names).
 * Numeric / ID fields should NOT use this — pass only name-like strings.
 */
export default function TeText({ value, className, as: Tag = 'span' }) {
  const { isTe } = useLocale()
  const raw = value == null ? '' : String(value)
  const [shown, setShown] = useState(raw)

  useEffect(() => {
    let alive = true
    if (!isTe || !raw || hasTelugu(raw)) {
      setShown(raw)
      return undefined
    }
    setShown(raw) // show English until ready
    transliterateToTe(raw).then((te) => {
      if (alive) setShown(te)
    })
    return () => {
      alive = false
    }
  }, [isTe, raw])

  return (
    <Tag className={className} title={isTe && shown !== raw ? raw : undefined} lang={isTe ? 'te' : 'en'}>
      {shown || '—'}
    </Tag>
  )
}
