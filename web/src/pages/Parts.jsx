import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useVoterData } from '../context/VoterData'
import { normalizeBoothName } from '../lib/booths'

export default function Parts() {
  const { loading, error, stats, families } = useVoterData()

  const enrichment = useMemo(() => {
    const map = new Map()
    for (const f of families) {
      const part = Number(f.part)
      if (!map.has(part)) map.set(part, { households: 0, links: 0, unlinked: 0 })
      const row = map.get(part)
      row.households += 1
      row.links += f.linkedCount || 0
      row.unlinked += f.unlinkedCount || 0
    }
    return map
  }, [families])

  if (loading) return <p className="state">Loading…</p>
  if (error) return <p className="state error">{error}</p>

  return (
    <div className="stack">
      <div className="crumb">
        <Link to="/">{stats.constituency}</Link>
        <span>/</span>
        <strong>Parts</strong>
      </div>
      <header className="page-head">
        <h1>Parts directory</h1>
        <p className="lede">
          All draft-roll parts · open a part for sections and electors · full rollup on{' '}
          <Link to="/consolidated">Consolidated</Link>
        </p>
      </header>

      <div className="table-wrap">
        <table className="voter-table">
          <thead>
            <tr>
              <th>Part</th>
              <th>Polling station</th>
              <th>District / Mandal</th>
              <th>Electors</th>
              <th>M / F</th>
              <th>Households</th>
              <th>Links</th>
              <th>Unlinked</th>
            </tr>
          </thead>
          <tbody>
            {stats.parts.map((p) => {
              const extra = enrichment.get(Number(p.part)) || { households: 0, links: 0, unlinked: 0 }
              return (
                <tr key={p.part}>
                  <td>
                    <Link className="cell-link" to={`/parts/${p.part}`}>
                      Part {p.part}
                    </Link>
                  </td>
                  <td title={p.pollingStationName || undefined}>
                    {normalizeBoothName(p.pollingStationName) || p.pollingStationName || '—'}
                  </td>
                  <td>
                    {p.district || '—'}
                    <div className="muted small">{p.tehsilMandal || ''}</div>
                  </td>
                  <td>{p.total.toLocaleString()}</td>
                  <td>
                    {p.male} / {p.female}
                  </td>
                  <td>{extra.households.toLocaleString()}</td>
                  <td>{extra.links.toLocaleString()}</td>
                  <td>
                    {extra.unlinked ? (
                      <span className="unlinked-tag">{extra.unlinked}</span>
                    ) : (
                      <span className="muted">0</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
