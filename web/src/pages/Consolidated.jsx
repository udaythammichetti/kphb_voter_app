import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import KpiGrid from '../components/KpiGrid'
import MixBars from '../components/MixBars'
import PartElectorsChart from '../components/PartElectorsChart'
import { buildConsolidated } from '../lib/consolidated'
import { normalizeBoothName } from '../lib/booths'
import { useVoterData } from '../context/VoterData'

function deltaClass(d) {
  if (d == null) return 'muted'
  if (d === 0) return 'ok-pill'
  if (d < 0) return 'warn-pill'
  return 'bad-pill'
}

function fmtDelta(d) {
  if (d == null) return '—'
  if (d === 0) return '0'
  return d > 0 ? `+${d}` : String(d)
}

export default function Consolidated() {
  const { loading, error, voters, families, stats, famStats } = useVoterData()
  const navigate = useNavigate()

  const data = useMemo(() => {
    if (!voters.length) return null
    return buildConsolidated(voters, families, stats, famStats)
  }, [voters, families, stats, famStats])

  if (loading) return <p className="state">Loading Excel…</p>
  if (error) return <p className="state error">{error}</p>
  if (!data) return <p className="state">No voter data loaded.</p>

  const { totals, parts, stations, linkRate, genderMix, checks, missingSummary, crossCheck } = data

  const kpis = [
    {
      label: 'Electors',
      value: totals.electors.toLocaleString(),
      hint: `Cover net ${crossCheck.netSum.toLocaleString()} · Δ ${fmtDelta(crossCheck.totalDelta)}`,
      onClick: () => navigate('/voters'),
    },
    {
      label: 'Cross-check',
      value: `${crossCheck.okCount}/${crossCheck.checkCount}`,
      hint:
        crossCheck.issues === 0
          ? 'All parts clean'
          : `${crossCheck.issues} part(s) need review`,
    },
    {
      label: 'Households',
      value: totals.households.toLocaleString(),
      hint: `Avg ${totals.avgFamilySize} · ${totals.multi.toLocaleString()} multi`,
      onClick: () => navigate('/families'),
    },
    {
      label: 'Family link rate',
      value: `${linkRate}%`,
      hint: `${totals.links.toLocaleString()} links · ${totals.unlinked.toLocaleString()} unlinked`,
      onClick: () => navigate('/families'),
    },
  ]

  return (
    <div className="stack">
      <div className="crumb">
        <Link to="/">{stats.constituency}</Link>
        <span>/</span>
        <strong>Consolidated</strong>
      </div>

      <header className="page-head consol-head">
        <div>
          <p className="eyebrow">Single-view rollup · {stats.yearOfRevision}</p>
          <h1>Consolidated dashboard</h1>
          <p className="lede">
            AC {stats.constituency} · PC {stats.parliamentaryConstituency} · {stats.district} ·{' '}
            {stats.tehsilMandal} · PIN {stats.pinCode}
          </p>
        </div>
        <div className="consol-actions">
          <Link className="secondary-btn" to="/voters">
            Voters
          </Link>
          <Link className="secondary-btn" to="/families">
            Families
          </Link>
          <Link className="secondary-btn" to="/parts">
            Parts
          </Link>
        </div>
      </header>

      <KpiGrid items={kpis} />

      <section className="panel">
        <div className="panel-head">
          <h2>Cross-checks</h2>
          <span className="muted">
            Extracted vs cover net · S.No · EPIC · missing fields
          </span>
        </div>
        <div className="check-grid">
          {checks.map((c) => (
            <article key={c.id} className={`check-card is-${c.severity}`}>
              <div className="check-top">
                <strong>{c.label}</strong>
                <span className={c.ok ? 'ok-pill' : c.severity === 'warn' ? 'warn-pill' : 'bad-pill'}>
                  {c.value}
                </span>
              </div>
              <p className="muted small tight">{c.detail}</p>
            </article>
          ))}
        </div>
      </section>

      {(missingSummary.length > 0 || crossCheck.totalDelta !== 0) && (
        <section className="panel">
          <div className="panel-head">
            <h2>Missing / shortfall notes</h2>
            <span className="muted">What still needs attention</span>
          </div>
          <ul className="miss-list">
            {crossCheck.totalDelta !== 0 ? (
              <li>
                <strong>{Math.abs(crossCheck.totalDelta)}</strong> electors short of cover page net total
                across {crossCheck.partsWithDelta} parts (likely OCR / skipped cards on last pages).
              </li>
            ) : null}
            {crossCheck.totalSerialGaps > 0 ? (
              <li>
                <strong>{crossCheck.totalSerialGaps}</strong> S.No gaps inside part ranges — often the same
                missing cards as the cover-net shortfall.
              </li>
            ) : null}
            {missingSummary.map((f) => (
              <li key={f.field}>
                <strong>{f.field}</strong> coverage {f.pct}% · {(stats.total - f.count).toLocaleString()}{' '}
                missing
              </li>
            ))}
            {crossCheck.totalMissingRelation > 0 ? (
              <li>
                <strong>{crossCheck.totalMissingRelation}</strong> rows missing relation type/name — family
                tree cannot link those electors.
              </li>
            ) : null}
          </ul>
        </section>
      )}

      <section className="split">
        <article className="panel mix-panel">
          <div className="panel-head">
            <h2>Age bands</h2>
            <span className="muted">{totals.electors.toLocaleString()}</span>
          </div>
          <MixBars items={stats.ageBands} accent="teal" />
        </article>
        <article className="panel mix-panel">
          <div className="panel-head">
            <h2>Gender mix</h2>
          </div>
          <MixBars items={genderMix} accent="amber" />
        </article>
      </section>

      <section className="split">
        <article className="panel mix-panel">
          <div className="panel-head">
            <h2>Household size mix</h2>
            <Link to="/families">Families</Link>
          </div>
          <MixBars items={famStats.sizeBands} accent="amber" />
        </article>
        <article className="panel">
          <div className="panel-head">
            <h2>Electors by polling station</h2>
            <Link to="/parts">Parts</Link>
          </div>
          <PartElectorsChart voters={voters} total={totals.electors} />
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Part-wise cross-check</h2>
          <span className="muted">Extracted vs cover net · S.No gaps · missing fields</span>
        </div>
        <div className="table-wrap">
          <table className="voter-table">
            <thead>
              <tr>
                <th>Part</th>
                <th>Extracted</th>
                <th>Cover net</th>
                <th>Δ Total</th>
                <th>Δ M / F</th>
                <th>S.No range</th>
                <th>Gaps</th>
                <th>Miss rel</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.part} className={p.status !== 'ok' ? 'row-warn' : ''}>
                  <td>
                    <Link className="cell-link" to={`/parts/${p.part}`}>
                      Part {p.part}
                    </Link>
                    <div className="muted small">
                      {normalizeBoothName(p.pollingStationName) || p.pollingStationName}
                    </div>
                  </td>
                  <td>{p.electors.toLocaleString()}</td>
                  <td>{p.netTotal != null ? Number(p.netTotal).toLocaleString() : '—'}</td>
                  <td>
                    <span className={deltaClass(p.deltaTotal)}>{fmtDelta(p.deltaTotal)}</span>
                  </td>
                  <td className="mono">
                    <span className={deltaClass(p.deltaMale)}>{fmtDelta(p.deltaMale)}</span>
                    {' / '}
                    <span className={deltaClass(p.deltaFemale)}>{fmtDelta(p.deltaFemale)}</span>
                  </td>
                  <td className="mono">
                    {p.serialMin != null ? `${p.serialMin}–${p.serialMax}` : '—'}
                  </td>
                  <td>
                    {p.serialGaps ? (
                      <span className="warn-pill" title={p.serialGapSample?.join(', ')}>
                        {p.serialGaps}
                      </span>
                    ) : (
                      <span className="muted">0</span>
                    )}
                  </td>
                  <td>{p.missingRelation || 0}</td>
                  <td>
                    <span
                      className={
                        p.status === 'ok' ? 'ok-pill' : p.status === 'warn' ? 'warn-pill' : 'bad-pill'
                      }
                    >
                      {p.status === 'ok' ? 'OK' : p.flags.join(', ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Part-wise consolidated</h2>
          <span className="muted">Households · relation links</span>
        </div>
        <div className="table-wrap">
          <table className="voter-table">
            <thead>
              <tr>
                <th>Part</th>
                <th>Sections</th>
                <th>Electors</th>
                <th>M / F</th>
                <th>Households</th>
                <th>Links</th>
                <th>Unlinked</th>
                <th>Female %</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={`fam-${p.part}`}>
                  <td>
                    <Link className="cell-link" to={`/parts/${p.part}`}>
                      Part {p.part}
                    </Link>
                  </td>
                  <td>{p.sections}</td>
                  <td>{p.electors.toLocaleString()}</td>
                  <td>
                    {p.male} / {p.female}
                  </td>
                  <td>
                    {p.households.toLocaleString()}
                    <div className="muted small">
                      {p.multiHouseholds} multi · {p.largeFamilies} large
                    </div>
                  </td>
                  <td>{p.links.toLocaleString()}</td>
                  <td>
                    {p.unlinked ? (
                      <span className="unlinked-tag">{p.unlinked}</span>
                    ) : (
                      <span className="muted">0</span>
                    )}
                  </td>
                  <td>{p.femaleShare}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Polling stations</h2>
          <span className="muted">{stations.length} stations</span>
        </div>
        <div className="table-wrap">
          <table className="voter-table">
            <thead>
              <tr>
                <th>Polling station</th>
                <th>Parts</th>
                <th>Electors</th>
                <th>M / F</th>
                <th>Female %</th>
                <th>Households</th>
              </tr>
            </thead>
            <tbody>
              {stations.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td className="mono">{s.parts}</td>
                  <td>{s.electors.toLocaleString()}</td>
                  <td>
                    {s.male} / {s.female}
                  </td>
                  <td>{s.femalePct}%</td>
                  <td>{s.households.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="split">
        <article className="panel">
          <div className="panel-head">
            <h2>Data coverage</h2>
            <span className="muted">PDF → Excel fields</span>
          </div>
          <div className="table-wrap flat">
            <table className="voter-table">
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Mapped</th>
                  <th>Missing</th>
                  <th>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {(stats.fieldCoverage || []).map((f) => (
                  <tr key={f.field}>
                    <td>{f.field}</td>
                    <td>{f.count.toLocaleString()}</td>
                    <td>{(stats.total - f.count).toLocaleString()}</td>
                    <td>
                      <span className={f.pct >= 99 ? 'ok-pill' : f.pct >= 90 ? 'warn-pill' : 'bad-pill'}>
                        {f.pct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Largest households</h2>
            <Link to="/families">All</Link>
          </div>
          <div className="table-wrap flat">
            <table className="voter-table">
              <thead>
                <tr>
                  <th>Part</th>
                  <th>House</th>
                  <th>Head</th>
                  <th>Size</th>
                  <th>Unlinked</th>
                </tr>
              </thead>
              <tbody>
                {famStats.topFamilies.map((f) => (
                  <tr key={f.id}>
                    <td>{f.part}</td>
                    <td>
                      <Link className="cell-link" to={`/families/${encodeURIComponent(f.id)}`}>
                        {f.house}
                      </Link>
                    </td>
                    <td>{f.headName}</td>
                    <td>{f.size}</td>
                    <td>
                      {f.unlinkedCount ? (
                        <span className="unlinked-tag">{f.unlinkedCount}</span>
                      ) : (
                        <span className="muted">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="meta-strip consol-meta">
        <div>
          <span>Qualifying date</span>
          <strong>{stats.qualifyingDate || '—'}</strong>
        </div>
        <div>
          <span>Publication</span>
          <strong>{stats.dateOfPublication || '—'}</strong>
        </div>
        <div>
          <span>Revision</span>
          <strong>{stats.typeOfRevision || '—'}</strong>
        </div>
        <div>
          <span>Hierarchy</span>
          <strong>AC → Part → Section → House → Voter</strong>
        </div>
      </section>
    </div>
  )
}
