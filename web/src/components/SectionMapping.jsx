import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { buildBoothRollup } from '../lib/booths'
import { useLocale } from '../context/Locale'
import { useVoterData } from '../context/VoterData'

const COLUMNS = [
  { key: 'name', label: 'Polling station', type: 'text', get: (s) => s.name },
  { key: 'parts', label: 'Parts', type: 'num', get: (s) => s.parts.length },
  { key: 'sections', label: 'Sections', type: 'num', get: (s) => s.sectionsCount },
  { key: 'electors', label: 'Electors', type: 'num', get: (s) => s.total },
  { key: 'share', label: 'Roll share', type: 'num', get: (s) => s.total },
  { key: 'male', label: 'Male', type: 'num', get: (s) => s.male },
  { key: 'female', label: 'Female', type: 'num', get: (s) => s.female },
  { key: 'femaleShare', label: 'Female %', type: 'num', get: (s) => s.femaleShare },
  { key: 'households', label: 'Households', type: 'num', get: (s) => s.households },
  { key: 'avgAge', label: 'Avg age', type: 'num', get: (s) => s.avgAge },
  { key: 'youth', label: 'Youth % (<35)', type: 'num', get: (s) => s.youthPct },
  { key: 'senior', label: 'Senior % (60+)', type: 'num', get: (s) => s.seniorPct },
]

function SortTh({ col, sortKey, dir, onSort }) {
  const active = sortKey === col.key
  const label = col.key === 'youth' ? (
    <>
      Youth % (&lt;35)
    </>
  ) : col.key === 'senior' ? (
    <>
      Senior % (60+)
    </>
  ) : (
    col.label
  )
  return (
    <th scope="col" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={`th-sort${active ? ' is-active' : ''}`}
        onClick={() => onSort(col.key)}
      >
        <span>{label}</span>
        <span className="th-sort-icon" aria-hidden="true">
          {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}

export default function SectionMapping({ voters = [], totalElectors = 0 }) {
  const navigate = useNavigate()
  const { t } = useLocale()
  const {
    setPollingStations,
    setPart,
    setPcs,
    setSectionNo,
    setGender,
    setAgeBand,
    setQ,
  } = useVoterData()
  const [q, setLocalQ] = useState('')
  const [sortKey, setSortKey] = useState('electors')
  const [dir, setDir] = useState('desc')

  const stations = useMemo(() => buildBoothRollup(voters), [voters])

  const maxElectors = useMemo(
    () => Math.max(1, ...stations.map((s) => s.total || 0)),
    [stations],
  )

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    let rows = stations.filter((s) => {
      if (!query) return true
      return (
        s.name.toLowerCase().includes(query) ||
        (s.address || '').toLowerCase().includes(query) ||
        s.partsLabel.toLowerCase().includes(query) ||
        s.parts.some((p) => String(p).includes(query))
      )
    })

    const col = COLUMNS.find((c) => c.key === sortKey) || COLUMNS[3]
    const sign = dir === 'asc' ? 1 : -1
    rows = [...rows].sort((a, b) => {
      const av = col.get(a)
      const bv = col.get(b)
      if (col.type === 'text') {
        return sign * String(av).localeCompare(String(bv), undefined, { numeric: true })
      }
      const an = Number(av) || 0
      const bn = Number(bv) || 0
      if (an !== bn) return sign * (an - bn)
      return a.name.localeCompare(b.name)
    })
    return rows
  }, [stations, q, sortKey, dir])

  const summary = useMemo(() => {
    const electors = filtered.reduce((s, r) => s + r.total, 0)
    const households = filtered.reduce((s, r) => s + (r.households || 0), 0)
    const sections = filtered.reduce((s, r) => s + (r.sectionsCount || 0), 0)
    return { count: filtered.length, electors, households, sections }
  }, [filtered])

  function toggleSort(key) {
    if (sortKey === key) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    // Text / name start ascending; numeric KPIs start descending
    const col = COLUMNS.find((c) => c.key === key)
    setDir(col?.type === 'text' ? 'asc' : 'desc')
  }

  function openStation(name) {
    setQ('')
    setPart('')
    setSectionNo('')
    setGender('')
    setAgeBand('')
    setPcs([])
    setPollingStations([name])
    navigate('/voters')
  }

  return (
    <section className="panel section-map">
      <div className="panel-head">
        <div>
          <h2>{t('Polling station mapping')}</h2>
          <p className="muted tight">
            {summary.count} stations · {summary.electors.toLocaleString()} electors ·{' '}
            {summary.sections.toLocaleString()} sections ·{' '}
            {summary.households.toLocaleString()} households
            {totalElectors ? ` · of ${totalElectors.toLocaleString()} total` : ''}
            {' · '}
            click a column to sort
          </p>
        </div>
      </div>

      <div className="sm-toolbar">
        <div className="sm-controls">
          <input
            className="sm-search"
            value={q}
            onChange={(e) => setLocalQ(e.target.value)}
            placeholder="Search station, address, part…"
          />
        </div>
      </div>

      <div className="table-wrap sm-table">
        <table className="voter-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <SortTh key={col.key} col={col} sortKey={sortKey} dir={dir} onSort={toggleSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const share = totalElectors ? Math.round((s.total / totalElectors) * 1000) / 10 : 0
              const bar = Math.round((s.total / maxElectors) * 100)
              return (
                <tr key={s.name}>
                  <td>
                    <button
                      type="button"
                      className="cell-link cell-btn"
                      onClick={() => openStation(s.name)}
                      title={s.rawName || s.name}
                    >
                      {s.name}
                    </button>
                    {s.address ? <div className="muted small">{s.address}</div> : null}
                  </td>
                  <td>
                    {s.parts.map((p, i) => (
                      <span key={p}>
                        {i > 0 ? ', ' : ''}
                        <Link className="cell-link" to={`/parts/${p}`}>
                          P{p}
                        </Link>
                      </span>
                    ))}
                    {!s.parts.length ? '—' : null}
                  </td>
                  <td>{s.sectionsCount.toLocaleString()}</td>
                  <td>{s.total.toLocaleString()}</td>
                  <td className="sm-share">
                    <div className="sm-track" title={`${share}% of roll`}>
                      <div className="sm-fill" style={{ width: `${bar}%` }} />
                    </div>
                    <span className="muted small">{share}%</span>
                  </td>
                  <td>{s.male.toLocaleString()}</td>
                  <td>{s.female.toLocaleString()}</td>
                  <td>{s.femaleShare}%</td>
                  <td>{s.households.toLocaleString()}</td>
                  <td>{s.avgAge || '—'}</td>
                  <td>{s.youthPct}%</td>
                  <td>{s.seniorPct}%</td>
                </tr>
              )
            })}
            {!filtered.length ? (
              <tr>
                <td colSpan={COLUMNS.length} className="muted">
                  No polling stations match the current filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
