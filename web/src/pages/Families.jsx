import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useVoterData } from '../context/VoterData'

const PAGE = 100

export default function Families() {
  const {
    loading,
    error,
    stats,
    famStats,
    filteredFamilies,
    filters,
    setFamilyQ,
    setPart,
    setFamilyMinSize,
    setFamilyOnlyUnlinked,
    clearFilters,
    openVoter,
    getVoter,
  } = useVoterData()
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(filteredFamilies.length / PAGE))
  const safePage = Math.min(page, totalPages)
  const slice = useMemo(() => {
    const start = (safePage - 1) * PAGE
    return filteredFamilies.slice(start, start + PAGE)
  }, [filteredFamilies, safePage])

  if (loading) return <p className="state">Loading…</p>
  if (error) return <p className="state error">{error}</p>

  return (
    <div className="stack">
      <div className="crumb">
        <Link to="/">{stats.constituency}</Link>
        <span>/</span>
        <strong>Families</strong>
      </div>

      <header className="page-head">
        <h1>Family / household hierarchy</h1>
        <p className="lede">
          Same house → Father / Husband / Mother name match. No match = Unlinked. Click head name for elector
          detail.
        </p>
      </header>

      <div className="kpi-grid">
        <article className="kpi">
          <p className="kpi-label">Households</p>
          <p className="kpi-value">{famStats.households.toLocaleString()}</p>
          <p className="kpi-hint">Avg size {famStats.avgSize}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Relation links</p>
          <p className="kpi-value">{famStats.totalLinks.toLocaleString()}</p>
          <p className="kpi-hint">{famStats.multi.toLocaleString()} multi-member houses</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Unlinked electors</p>
          <p className="kpi-value">{famStats.totalUnlinked.toLocaleString()}</p>
          <p className="kpi-hint">In {famStats.withUnlinked.toLocaleString()} shared houses</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Showing</p>
          <p className="kpi-value">{filteredFamilies.length.toLocaleString()}</p>
          <p className="kpi-hint">After current filters</p>
        </article>
      </div>

      <div className="filters">
        <label className="filter-field grow">
          <span>Search family</span>
          <input
            value={filters.familyQ}
            onChange={(e) => {
              setFamilyQ(e.target.value)
              setPage(1)
            }}
            placeholder="Head, member, EPIC, house, station…"
          />
        </label>
        <label className="filter-field">
          <span>Part</span>
          <select
            value={filters.part}
            onChange={(e) => {
              setPart(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All parts</option>
            {stats.parts.map((p) => (
              <option key={p.part} value={p.part}>
                Part {p.part}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Min size</span>
          <select
            value={filters.familyMinSize}
            onChange={(e) => {
              setFamilyMinSize(Number(e.target.value))
              setPage(1)
            }}
          >
            <option value={0}>Any</option>
            <option value={2}>2+</option>
            <option value={3}>3+</option>
            <option value={5}>5+</option>
            <option value={8}>8+</option>
          </select>
        </label>
        <label className="filter-field">
          <span>Link status</span>
          <select
            value={filters.familyOnlyUnlinked ? 'unlinked' : ''}
            onChange={(e) => {
              setFamilyOnlyUnlinked(e.target.value === 'unlinked')
              setPage(1)
            }}
          >
            <option value="">All houses</option>
            <option value="unlinked">Has unlinked</option>
          </select>
        </label>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => {
            clearFilters()
            setPage(1)
          }}
        >
          Reset
        </button>
      </div>

      <div className="table-wrap">
        <table className="voter-table">
          <thead>
            <tr>
              <th>Part</th>
              <th>House</th>
              <th>Head</th>
              <th>Size</th>
              <th>M / F</th>
              <th>Links</th>
              <th>Unlinked</th>
              <th>Section</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((f) => (
              <tr key={f.id}>
                <td>
                  <Link className="cell-link" to={`/parts/${f.part}`}>
                    {f.part}
                  </Link>
                </td>
                <td>
                  <Link className="cell-link" to={`/families/${encodeURIComponent(f.id)}`}>
                    {f.house}
                  </Link>
                </td>
                <td>
                  <button
                    type="button"
                    className="cell-btn name-btn"
                    onClick={() => openVoter(getVoter(f.headEpic) || { epic: f.headEpic, name: f.headName })}
                  >
                    {f.headName}
                  </button>
                  <div className="muted small">
                    {f.headEpic ? (
                      <button type="button" className="cell-btn mono" onClick={() => openVoter(f.headEpic)}>
                        {f.headEpic}
                      </button>
                    ) : (
                      '—'
                    )}
                  </div>
                </td>
                <td>{f.size}</td>
                <td>
                  {f.male} / {f.female}
                </td>
                <td>{f.linkedCount}</td>
                <td>
                  {f.unlinkedCount ? (
                    <span className="unlinked-tag">{f.unlinkedCount}</span>
                  ) : (
                    <span className="muted">0</span>
                  )}
                </td>
                <td className="muted small">
                  {f.sectionNo ? `${f.sectionNo} · ${f.sectionName}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pager">
          <button type="button" className="ghost-btn" disabled={safePage <= 1} onClick={() => setPage(1)}>
            First
          </button>
          <button
            type="button"
            className="ghost-btn"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span>
            Page {safePage} / {totalPages} · {filteredFamilies.length.toLocaleString()} houses
          </span>
          <button
            type="button"
            className="ghost-btn"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
          <button
            type="button"
            className="ghost-btn"
            disabled={safePage >= totalPages}
            onClick={() => setPage(totalPages)}
          >
            Last
          </button>
        </div>
      </div>
    </div>
  )
}
