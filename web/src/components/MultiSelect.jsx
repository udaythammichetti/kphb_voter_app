import { useEffect, useMemo, useRef, useState } from 'react'

export default function MultiSelect({
  label,
  options = [],
  value = [],
  onChange,
  placeholder = 'All',
  wide = false,
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return options
    return options.filter((o) => o.label.toLowerCase().includes(query) || o.value.toLowerCase().includes(query))
  }, [options, q])

  const selectedSet = useMemo(() => new Set(value), [value])

  const summary = useMemo(() => {
    if (!value.length) return placeholder
    if (value.length === 1) {
      return options.find((o) => o.value === value[0])?.label || value[0]
    }
    return `${value.length} selected`
  }, [value, options, placeholder])

  const toggle = (v) => {
    if (selectedSet.has(v)) onChange(value.filter((x) => x !== v))
    else onChange([...value, v])
  }

  const clear = (e) => {
    e.stopPropagation()
    onChange([])
  }

  return (
    <div className={`filter-field multi-select${wide ? ' wide' : ''}`} ref={rootRef}>
      <span>{label}</span>
      <button
        type="button"
        className={`ms-trigger${value.length ? ' has-value' : ''}${open ? ' is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="ms-summary">{summary}</span>
        {value.length ? (
          <span
            className="ms-clear"
            role="button"
            tabIndex={0}
            onClick={clear}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') clear(e)
            }}
          >
            ×
          </span>
        ) : (
          <span className="ms-caret">▾</span>
        )}
      </button>
      {open ? (
        <div className="ms-panel">
          {options.length > 6 ? (
            <input
              className="ms-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter…"
              autoFocus
            />
          ) : null}
          <div className="ms-actions">
            <button type="button" onClick={() => onChange(options.map((o) => o.value))}>
              All
            </button>
            <button type="button" onClick={() => onChange([])}>
              None
            </button>
          </div>
          <ul className="ms-list">
            {filtered.map((o) => {
              const checked = selectedSet.has(o.value)
              return (
                <li key={o.value}>
                  <label className={checked ? 'is-checked' : ''}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(o.value)} />
                    <span>{o.label}</span>
                    {o.count != null ? <em>{o.count.toLocaleString()}</em> : null}
                  </label>
                </li>
              )
            })}
            {!filtered.length ? <li className="ms-empty">No matches</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
