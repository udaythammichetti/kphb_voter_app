/** Download rows as CSV (Excel-friendly UTF-8 BOM). Locale-aware EN | తెలుగు. */

import { peekTe, tLabel, transliterateMany } from './telugu'

function escapeCell(v) {
  const s = v == null ? '' : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function downloadCsv(filename, columns, rows) {
  const parts = [columns.map((c) => escapeCell(c.label)).join(',')]
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    parts.push(columns.map((c) => escapeCell(typeof c.value === 'function' ? c.value(row) : row[c.key])).join(','))
  }
  const blob = new Blob([`\uFEFF${parts.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function mapGet(map, key) {
  if (key == null || key === '') return ''
  const s = String(key).trim()
  if (!s) return ''
  if (map?.has(s)) return map.get(s)
  const peek = peekTe(s)
  return peek || s
}

export function voterCsvColumns(lang = 'en', nameMap, relMap) {
  const L = (key) => tLabel(key, lang)
  const te = lang === 'te'

  return [
    { key: 'part', label: L('Part') },
    { key: 'section', label: L('Section') },
    { key: 'serial', label: L('S.No'), value: (v) => v.serial ?? v.serialRaw ?? '' },
    { key: 'epic', label: 'EPIC' },
    {
      key: 'name',
      label: L('Name'),
      value: (v) => (te ? mapGet(nameMap, v.name) : v.name || ''),
    },
    {
      key: 'relationType',
      label: L('Relation Type'),
      value: (v) => (v.relationType ? L(v.relationType) : ''),
    },
    {
      key: 'relationName',
      label: L('Relation Name'),
      value: (v) => (te ? mapGet(relMap, v.relationName) : v.relationName || ''),
    },
    { key: 'house', label: L('House No') },
    { key: 'age', label: L('Age') },
    {
      key: 'gender',
      label: L('Gender'),
      value: (v) => (v.gender ? L(v.gender) : ''),
    },
    { key: 'parliamentaryConstituency', label: L('PC') },
    { key: 'pollingStationName', label: L('Polling Station') },
    { key: 'constituency', label: L('AC') },
    { key: 'page', label: L('PDF Page') },
  ]
}

/** @deprecated Prefer exportVotersLocalized — kept for English-only callers. */
export const VOTER_CSV_COLUMNS = voterCsvColumns('en')

function withLangSuffix(name, lang) {
  const stem = String(name || 'voters_export')
    .replace(/\.csv$/i, '')
    .replace(/_(en|te)$/i, '')
  return `${stem}_${lang}.csv`
}

/**
 * Export voters CSV in the active language.
 * Telugu: column headers + gender/relation labels in TE.
 * Names: use cache immediately; only fetch missing (with progress). Cap live fetches
 * so huge rolls stay usable — rest stay English until browsed/cached.
 */
export async function exportVotersLocalized(rows, options = {}) {
  const lang = options.lang === 'te' ? 'te' : 'en'
  const filename = withLangSuffix(options.filename || 'kukatpally_voters.csv', lang)

  let nameMap
  let relMap
  if (lang === 'te') {
    const texts = []
    for (const v of rows) {
      if (v?.name) texts.push(v.name)
      if (v?.relationName) texts.push(v.relationName)
    }

    const uniq = [...new Set(texts.map((t) => String(t || '').trim()).filter(Boolean))]
    const missing = uniq.filter((t) => peekTe(t) == null)
    // Live API only for a bounded set; rest use English (or later cache).
    const FETCH_CAP = options.fetchCap ?? 400
    const toFetch = missing.slice(0, FETCH_CAP)

    let leftover = ''
    if (toFetch.length) {
      options.onStatus?.(
        `${tLabel('Preparing Telugu names…', 'te')} 0/${toFetch.length}`,
      )
      const map = await transliterateMany(toFetch, {
        concurrency: 28,
        onProgress: (done, total) => {
          options.onStatus?.(`${tLabel('Preparing Telugu names…', 'te')} ${done}/${total}`)
        },
      })
      nameMap = map
      relMap = map
      if (missing.length > FETCH_CAP) {
        leftover = `${toFetch.length} TE names · ${missing.length - FETCH_CAP} still EN (browse TE to cache more)`
      }
    } else {
      nameMap = new Map()
      relMap = nameMap
    }

    const columns = voterCsvColumns(lang, nameMap, relMap)
    downloadCsv(filename, columns, rows)
    options.onStatus?.(leftover)
    return
  }

  const columns = voterCsvColumns(lang, nameMap, relMap)
  downloadCsv(filename, columns, rows)
  options.onStatus?.('')
}

export function exportVotersCsv(rows, filename = 'voters_export.csv') {
  downloadCsv(filename, voterCsvColumns('en'), rows)
}
