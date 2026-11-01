import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import FiltersBar from '../components/FiltersBar'
import KpiGrid from '../components/KpiGrid'
import VoterTable from '../components/VoterTable'
import { useVoterData } from '../context/VoterData'
import { computeStats, filterVoters } from '../lib/loadVoters'

export default function PartDetail() {
  const { partId } = useParams()
  const part = Number(partId)
  const { loading, error, voters, stats, families, filters, setPart, setSectionNo } = useVoterData()

  useEffect(() => {
    if (!Number.isNaN(part) && String(filters.part) !== String(part)) {
      setPart(String(part))
      setSectionNo('')
    }
  }, [part, filters.part, setPart, setSectionNo])

  const basePartVoters = useMemo(
    () => voters.filter((v) => Number(v.part) === part),
    [voters, part],
  )
  const partStats = useMemo(() => computeStats(basePartVoters), [basePartVoters])
  const partFamilyStats = useMemo(() => {
    const list = families.filter((f) => Number(f.part) === part)
    return {
      households: list.length,
      links: list.reduce((s, f) => s + (f.linkedCount || 0), 0),
      unlinked: list.reduce((s, f) => s + (f.unlinkedCount || 0), 0),
    }
  }, [families, part])
  const partVoters = useMemo(() => {
    const looksFullSection = String(filters.sectionNo).includes('-')
    return filterVoters(voters, {
      q: filters.q,
      part,
      section: looksFullSection ? filters.sectionNo : '',
      sectionNo: looksFullSection ? '' : filters.sectionNo,
      gender: filters.gender,
      ageBand: filters.ageBand,
      pcs: filters.pcs,
      pollingStations: filters.pollingStations,
    })
  }, [voters, filters, part])

  if (loading) return <p className="state">Loading…</p>
  if (error) return <p className="state error">{error}</p>

  const exists = stats.parts.some((p) => p.part === part)
  if (!exists) {
    return (
      <p className="state error">
        Part {partId} not found. <Link to="/parts">Back to parts</Link>
      </p>
    )
  }

  return (
    <div className="stack">
      <div className="crumb">
        <Link to="/">{stats.constituency}</Link>
        <span>/</span>
        <Link to="/parts">Parts</Link>
        <span>/</span>
        <strong>Part {part}</strong>
      </div>

      <header className="page-head">
        <h1>Part {part}</h1>
        <p className="lede">
          {basePartVoters[0]?.pollingStationName || 'Polling station'} · {basePartVoters[0]?.mainTown || ''} · PIN{' '}
          {basePartVoters[0]?.pinCode || '—'}
        </p>
      </header>

      <section className="meta-strip">
        <div>
          <span>Assembly Constituency No and Name</span>
          <strong>
            {basePartVoters[0]?.constituency || '—'}
            <br />
            <span className="muted">{basePartVoters[0]?.parliamentaryConstituency || '—'}</span>
          </strong>
        </div>
        <div>
          <span>District / Mandal</span>
          <strong>
            {basePartVoters[0]?.district || '—'}
            <br />
            {basePartVoters[0]?.tehsilMandal || '—'}
          </strong>
        </div>
        <div>
          <span>Polling station</span>
          <strong>{basePartVoters[0]?.pollingStationName || '—'}</strong>
        </div>
        <div>
          <span>Roll net total</span>
          <strong>
            {basePartVoters[0]?.netTotal ?? '—'}
            <br />
            <span className="muted">
              M {basePartVoters[0]?.netMale ?? '—'} · F {basePartVoters[0]?.netFemale ?? '—'}
            </span>
          </strong>
        </div>
      </section>

      <KpiGrid
        items={[
          { label: 'Electors', value: partStats.total.toLocaleString(), hint: `${partStats.sectionsCount} sections` },
          {
            label: 'Households',
            value: partFamilyStats.households.toLocaleString(),
            hint: `${partFamilyStats.links} links · ${partFamilyStats.unlinked} unlinked`,
          },
          {
            label: 'Female %',
            value: `${partStats.femalePct}%`,
            hint: `${partStats.female} F · ${partStats.male} M`,
          },
          { label: 'Avg age', value: partStats.avgAge, hint: `Youth <35: ${partStats.youthPct}%` },
        ]}
      />

      <section className="panel">
        <div className="panel-head">
          <h2>Sections in Part {part}</h2>
        </div>
        <div className="part-grid">
          {partStats.sections.map((s) => (
            <Link
              key={s.key}
              to={`/parts/${part}/sections/${encodeURIComponent(s.section || s.label)}`}
              className="part-card"
            >
              <div className="part-card-top">
                <strong>Section {s.sectionNo || '—'}</strong>
                <span>{s.total}</span>
              </div>
              <p>{s.section || s.label}</p>
            </Link>
          ))}
        </div>
      </section>

      <FiltersBar showPart={false} lockPart={part} />
      <VoterTable rows={partVoters} pageSize={100} exportName={`part_${part}_voters.csv`} />
    </div>
  )
}
