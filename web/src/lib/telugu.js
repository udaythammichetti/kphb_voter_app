/** Telugu UI labels + English→Telugu name transliteration (Google Input Tools). */

const LABEL_TE = {
  Dashboard: 'డాష్‌బోర్డ్',
  Voters: 'ఓటర్లు',
  Families: 'కుటుంబాలు',
  Parts: 'భాగాలు',
  Consolidated: 'సంకలనం',
  'Total electors': 'మొత్తం ఓటర్లు',
  Households: 'గృహాలు',
  'Relation links': 'సంబంధ లింకులు',
  'Female share': 'స్త్రీల వాటా',
  'Age bands': 'వయస్సు వర్గాలు',
  'Household size mix': 'గృహ పరిమాణం',
  'Largest households': 'పెద్ద గృహాలు',
  'All families': 'అన్ని కుటుంబాలు',
  'View families': 'కుటుంబాలు చూడండి',
  'View parts': 'భాగాలు చూడండి',
  'Electors by polling station': 'పోలింగ్ స్టేషన్ వారీగా ఓటర్లు',
  'Polling station mapping': 'పోలింగ్ స్టేషన్ మ్యాపింగ్',
  'Key PDF → Excel columns': 'PDF → Excel కాలమ్‌లు',
  Coverage: 'కవరేజ్',
  Column: 'కాలమ్',
  Mapped: 'మ్యాప్ అయినవి',
  Part: 'భాగం',
  House: 'ఇల్లు',
  Head: 'అధిపతి',
  Size: 'పరిమాణం',
  Unlinked: 'అన్‌లింక్డ్',
  'Qualifying date': 'అర్హత తేదీ',
  Publication: 'ప్రచురణ',
  Revision: 'రివిజన్',
  'Page-header linking': 'పేజీ హెడర్ లింక్',
  'Mapped electoral report': 'మ్యాప్ చేసిన ఎన్నికల నివేదిక',
  electors: 'ఓటర్లు',
  parts: 'భాగాలు',
  sections: 'విభాగాలు',
  women: 'మహిళలు',
  men: 'పురుషులు',
  'multi-member': 'బహుళ సభ్యులు',
  'unlinked in shared houses': 'షేర్డ్ ఇళ్లలో అన్‌లింక్డ్',
  'houses have unlinked electors (same house, no name match)':
    'ఇళ్లలో అన్‌లింక్డ్ ఓటర్లు (అదే ఇల్లు, పేరు మ్యాచ్ లేదు)',
  Father: 'తండ్రి',
  Husband: 'భర్త',
  Mother: 'తల్లి',
  Male: 'పురుషులు',
  Female: 'స్త్రీలు',
  Name: 'పేరు',
  Relation: 'సంబంధం',
  'House No': 'ఇంటి నెం',
  Age: 'వయస్సు',
  Gender: 'లింగం',
  English: 'English',
  Telugu: 'తెలుగు',
  Print: 'ప్రింట్',
  'Export CSV': 'CSV ఎగుమతి',
  'Preparing…': 'సిద్ధమవుతోంది…',
  'Preparing Telugu names…': 'తెలుగు పేర్లు సిద్ధం చేస్తోంది…',
  Section: 'విభాగం',
  'S.No': 'క్రమ సంఖ్య',
  'Relation Type': 'సంబంధ రకం',
  'Relation Name': 'సంబంధ పేరు',
  PC: 'పార్లమెంటు నియోజకవర్గం',
  'Polling Station': 'పోలింగ్ స్టేషన్',
  AC: 'అసెంబ్లీ నియోజకవర్గం',
  'PDF Page': 'PDF పేజీ',
  Shown: 'చూపబడినవి',
  First: 'మొదటి',
  Prev: 'మునుపటి',
  Next: 'తర్వాత',
  Last: 'చివరి',
  Page: 'పేజీ',
  Rows: 'అడ్డు వరుసలు',
}

const cache = new Map()
const storageKey = 'kphp_te_xlit_v1'
const FETCH_TIMEOUT_MS = 3500
const DEFAULT_CONCURRENCY = 28

function loadCache() {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return
    const obj = JSON.parse(raw)
    for (const [k, v] of Object.entries(obj)) cache.set(k, v)
  } catch {
    /* ignore */
  }
}

let saveTimer = null
function saveCache(immediate = false) {
  const write = () => {
    try {
      const obj = Object.fromEntries([...cache.entries()].slice(-4000))
      localStorage.setItem(storageKey, JSON.stringify(obj))
    } catch {
      /* ignore */
    }
  }
  if (immediate) {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    write()
    return
  }
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    write()
  }, 800)
}

let cacheLoaded = false
function ensureCache() {
  if (cacheLoaded) return
  cacheLoaded = true
  loadCache()
}

export function tLabel(key, lang = 'en') {
  if (lang !== 'te') return key
  return LABEL_TE[key] || key
}

/** True if string already has Telugu letters. */
export function hasTelugu(text) {
  return /[\u0C00-\u0C7F]/.test(String(text || ''))
}

function cacheKey(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
}

/** Sync lookup — no network. */
export function peekTe(text) {
  const src = String(text || '').trim()
  if (!src) return ''
  if (hasTelugu(src)) return src
  ensureCache()
  return cache.get(cacheKey(src)) || null
}

/**
 * Transliterate English (or roman) text → Telugu script.
 * Uses Google Input Tools; cached in memory + localStorage.
 */
export async function transliterateToTe(text, { persist = true } = {}) {
  const src = String(text || '').trim()
  if (!src) return ''
  if (hasTelugu(src)) return src

  ensureCache()
  const key = cacheKey(src)
  if (cache.has(key)) return cache.get(key)

  const url =
    'https://inputtools.google.com/request?' +
    new URLSearchParams({
      text: src,
      itc: 'te-t-i0-und',
      num: '1',
      cp: '0',
      cs: '1',
      ie: 'utf-8',
      oe: 'utf-8',
      app: 'kphp-roll',
    }).toString()

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(String(res.status))
    const data = await res.json()
    // ["SUCCESS",[[ "input", ["suggestion", ...], ...]]]
    const suggestion = data?.[1]?.[0]?.[1]?.[0]
    const out = suggestion || src
    cache.set(key, out)
    if (persist) saveCache(false)
    return out
  } catch {
    // Do not poison cache with English on network failure — retry next time
    return src
  }
}

/**
 * Transliterate many strings. Skips cache hits. Network only for misses.
 * @param {string[]} texts
 * @param {{ concurrency?: number, onProgress?: (done:number, total:number) => void }} [opts]
 */
export async function transliterateMany(texts, opts = {}) {
  ensureCache()
  const uniq = [...new Set((texts || []).map((t) => String(t || '').trim()).filter(Boolean))]
  const out = new Map()
  const missing = []

  for (const item of uniq) {
    if (hasTelugu(item)) {
      out.set(item, item)
      continue
    }
    const hit = cache.get(cacheKey(item))
    if (hit != null) out.set(item, hit)
    else missing.push(item)
  }

  const total = uniq.length
  const cached = total - missing.length
  opts.onProgress?.(cached, total)

  if (!missing.length) return out

  const concurrency = Math.max(1, Math.min(opts.concurrency || DEFAULT_CONCURRENCY, missing.length))
  let done = cached
  let cursor = 0

  async function worker() {
    while (cursor < missing.length) {
      const idx = cursor++
      const item = missing[idx]
      const te = await transliterateToTe(item, { persist: false })
      out.set(item, te)
      done += 1
      opts.onProgress?.(done, total)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  saveCache(true)
  return out
}
