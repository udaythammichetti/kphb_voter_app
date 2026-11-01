import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import FiltersBar from '../components/FiltersBar'
import KpiGrid from '../components/KpiGrid'
import VoterTable from '../components/VoterTable'
import { useVoterData } from '../context/VoterData'
import { computeStats, filterVoters } from '../lib/loadVoters'

export default function SectionDetail() {
  const { partId, sectionId } = useParams()
  const part = Number(partId)
  const sectionHeader = decodeURIComponent(sectionId || '')
  const { loading, error, voters, stats, filters, setPart, setSectionNo } = useVoterData()

  useEffect(() => {
    setPart(String(part))
    setSectionNo(sectionHeader)
  }, [part, sectionHeader, setPart, setSectionNo])

  const base = useMemo(() => {
    return voters.filter((v) => {
      if (Number(v.part) !== part) return false
      // Match full page-header section text, or legacy section_no
      if (v.section === sectionHeader) return true
      if (String(v.sectionNo) === sectionHeader) return true
      return false
    })
  }, [voters, part, sectionHeader])

  const sectionStats = useMemo(() => computeStats(base), [base])
  const rows = useMemo(
    () =>
      filterVoters(voters, {
        q: filters.q,
        part,
        section: base[0]?.section || '',
        gender: filters.gender,
        ageBand: filters.ageBand,
        pcs: filters.pcs,
        pollingStations: filters.pollingStations,
      }),
    [voters, filters, part, base],
  )

  if (loading) return <p className="state">Loading…</p>
  if (error) return <p className="state error">{error}</p>
  if (!base.length) {
    return (
      <p className="state error">
        Section not found in Part {partId}. <Link to={`/parts/${partId}`}>Back</Link>
      </p>
    )
  }

  const title = base[0].section || `${base[0].sectionNo}-${base[0].sectionName}`

  return (
    <div className="stack">
      <div className="crumb">
        <Link to="/">{stats.constituency}</Link>
        <span>/</span>
        <Link to="/parts">Parts</Link>
        <span>/</span>
        <Link to={`/parts/${part}`}>Part {part}</Link>
        <span>/</span>
        <strong>{title}</strong>
      </div>

      <header className="page-head">
        <h1>Section No and Name: {title}</h1>
        <p className="lede">
          Linked from page header · Assembly Constituency No and Name: {base[0].constituency} · Part {part}
        </p>
      </header>

      <section className="meta-strip">
        <div>
          <span>Assembly Constituency</span>
          <strong>{base[0].constituency}</strong>
        </div>
        <div>
          <span>Part No</span>
          <strong>{part}</strong>
        </div>
        <div>
          <span>Section header</span>
          <strong>{title}</strong>
        </div>
        <div>
          <span>Electors in section</span>
          <strong>{sectionStats.total.toLocaleString()}</strong>
        </div>
      </section>

      <KpiGrid
        items={[
          { label: 'Electors', value: sectionStats.total.toLocaleString() },
          { label: 'Female %', value: `${sectionStats.femalePct}%` },
          { label: 'Avg age', value: sectionStats.avgAge },
          { label: 'Youth under 35', value: `${sectionStats.youthPct}%` },
        ]}
      />

      <FiltersBar showPart={false} showSection={false} lockPart={part} />
      <VoterTable rows={rows} pageSize={100} exportName={`part_${part}_section_voters.csv`} />
    </div>
  )
}
