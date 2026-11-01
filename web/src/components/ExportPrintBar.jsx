import { useState } from 'react'
import { exportVotersLocalized } from '../lib/exportCsv'
import { useLocale } from '../context/Locale'

/**
 * Print current view + export CSV using active EN | తెలుగు language.
 */
export default function ExportPrintBar({
  rows = [],
  exportName = 'kukatpally_voters.csv',
  className = '',
  compact = false,
}) {
  const { lang, t, isTe } = useLocale()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  async function onExport() {
    if (!rows.length || busy) return
    setBusy(true)
    setStatus(isTe ? t('Preparing Telugu names…') : '')
    try {
      await exportVotersLocalized(rows, {
        lang,
        filename: exportName,
        onStatus: setStatus,
      })
    } finally {
      setBusy(false)
      // leave brief status if exporter set a leftover note, then clear
      setTimeout(() => setStatus(''), 2500)
    }
  }

  function onPrint() {
    window.print()
  }

  return (
    <div className={`export-print-bar no-print ${className}`.trim()}>
      <button type="button" className="ghost-btn toolbar-btn" onClick={onPrint}>
        {t('Print')}
      </button>
      <button
        type="button"
        className="ghost-btn toolbar-btn"
        onClick={onExport}
        disabled={busy || !rows.length}
        title={rows.length ? `${rows.length.toLocaleString()} rows · ${isTe ? 'తెలుగు' : 'EN'}` : undefined}
      >
        {busy ? t('Preparing…') : t('Export CSV')}
        {!compact && !busy ? (
          <span className="export-lang-tag">{isTe ? 'TE' : 'EN'}</span>
        ) : null}
      </button>
      {status ? <span className="export-status muted small">{status}</span> : null}
    </div>
  )
}
