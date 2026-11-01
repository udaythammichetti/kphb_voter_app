import { Link, useParams } from 'react-router-dom'
import FamilyTree from '../components/FamilyTree'
import VoterTable from '../components/VoterTable'
import { useVoterData } from '../context/VoterData'
import { houseKey } from '../lib/families'

export default function FamilyDetail() {
  const { familyId } = useParams()
  const id = decodeURIComponent(familyId || '')
  const { loading, error, stats, getFamily, families, openVoter, getVoter } = useVoterData()

  if (loading) return <p className="state">Loading…</p>
  if (error) return <p className="state error">{error}</p>

  let family = getFamily(id)
  // allow /families/p1|h5-6-2 style fallback via query-like id
  if (!family && id.includes('|')) {
    family = families.find((f) => f.id === id)
  }
  if (!family) {
    return (
      <p className="state error">
        Family not found. <Link to="/families">Back to families</Link>
      </p>
    )
  }

  return (
    <div className="stack">
      <div className="crumb">
        <Link to="/">{stats.constituency}</Link>
        <span>/</span>
        <Link to="/families">Families</Link>
        <span>/</span>
        <strong>
          Part {family.part} · {family.house}
        </strong>
      </div>

      <header className="page-head">
        <h1>
          House {family.house}
          {family.surnameHint ? ` · ${family.surnameHint}` : ''}
        </h1>
        <p className="lede">
          Part {family.part}
          {family.sectionNo ? ` · Section ${family.sectionNo}` : ''} ·{' '}
          {family.pollingStationName || 'Polling station'}
        </p>
      </header>

      <div className="kpi-grid">
        <article className="kpi">
          <p className="kpi-label">Members</p>
          <p className="kpi-value">{family.size}</p>
        </article>
        <article
          className="kpi"
          role="button"
          onClick={() => openVoter(getVoter(family.headEpic) || { epic: family.headEpic, name: family.headName })}
          style={{ cursor: 'pointer' }}
        >
          <p className="kpi-label">Head</p>
          <p className="kpi-value" style={{ fontSize: '1.15rem' }}>
            {family.headName}
          </p>
          <p className="kpi-hint">
            {family.headAge ?? '—'} yrs · {family.headEpic} · click for detail
          </p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Gender split</p>
          <p className="kpi-value">
            {family.male}/{family.female}
          </p>
          <p className="kpi-hint">Male / Female</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Avg age</p>
          <p className="kpi-value">{family.avgAge}</p>
        </article>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Family tree</h2>
          <span className="muted">Relation-linked hierarchy</span>
        </div>
        <FamilyTree family={family} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Members table</h2>
          <Link to={`/voters`}>Search all voters</Link>
        </div>
        <VoterTable
          rows={family.members}
          pageSize={100}
          exportName={`family_p${family.part}_${String(family.house).replace(/[^\w-]+/g, '_')}.csv`}
        />
      </section>

      <p className="muted small">
        Family id: <code>{houseKey(family.part, family.house)}</code>
      </p>
    </div>
  )
}
