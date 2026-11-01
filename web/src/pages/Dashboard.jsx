import { Link, useNavigate } from 'react-router-dom'
import KpiGrid from '../components/KpiGrid'
import MixBars from '../components/MixBars'
import PartElectorsChart from '../components/PartElectorsChart'
import SectionMapping from '../components/SectionMapping'
import TeText from '../components/TeText'
import { useLocale } from '../context/Locale'
import { useVoterData } from '../context/VoterData'

export default function Dashboard() {
  const { loading, error, stats, famStats, voters } = useVoterData()
  const { t, isTe } = useLocale()
  const navigate = useNavigate()

  if (loading) return <p className="state">Loading voter Excel…</p>
  if (error) return <p className="state error">{error}</p>

  const kpis = [
    {
      label: t('Total electors'),
      value: stats.total.toLocaleString(),
      hint: `${stats.partsCount} ${t('parts')} · ${stats.sectionsCount} ${t('sections')}`,
      onClick: () => navigate('/voters'),
    },
    {
      label: t('Households'),
      value: famStats.households.toLocaleString(),
      hint: `Avg size ${famStats.avgSize} · ${famStats.multi.toLocaleString()} ${t('multi-member')}`,
      onClick: () => navigate('/families'),
    },
    {
      label: t('Relation links'),
      value: famStats.totalLinks.toLocaleString(),
      hint: `${famStats.totalUnlinked.toLocaleString()} ${t('unlinked in shared houses')}`,
      onClick: () => navigate('/families'),
    },
    {
      label: t('Female share'),
      value: `${stats.femalePct}%`,
      hint: `${stats.female.toLocaleString()} ${t('women')} · ${stats.male.toLocaleString()} ${t('men')}`,
    },
  ]

  return (
    <div className="stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">
            {t('Mapped electoral report')} · {stats.yearOfRevision}
            {isTe ? <span className="lang-hint"> · పేర్లు తెలుగులో</span> : null}
          </p>
          <h1>
            Assembly Constituency: {stats.constituency}
          </h1>
          <p className="lede">
            Linked from page headers · PC {stats.parliamentaryConstituency} · District {stats.district} · Mandal{' '}
            {stats.tehsilMandal} · PIN {stats.pinCode}
          </p>
        </div>
      </section>

      <section className="meta-strip">
        <div>
          <span>{t('Page-header linking')}</span>
          <strong>
            AC {stats.constituency} → Part → Section No and Name → House → Voter
          </strong>
        </div>
        <div>
          <span>{t('Qualifying date')}</span>
          <strong>{stats.qualifyingDate || '—'}</strong>
        </div>
        <div>
          <span>{t('Publication')}</span>
          <strong>{stats.dateOfPublication || '—'}</strong>
        </div>
        <div>
          <span>{t('Revision')}</span>
          <strong>{stats.typeOfRevision || 'SIR 2026'}</strong>
        </div>
      </section>

      <KpiGrid items={kpis} />

      <section className="split">
        <article className="panel mix-panel">
          <div className="panel-head">
            <h2>{t('Age bands')}</h2>
            <span className="muted">
              {stats.total.toLocaleString()} {t('electors')}
            </span>
          </div>
          <MixBars items={stats.ageBands} accent="teal" />
        </article>

        <article className="panel mix-panel">
          <div className="panel-head">
            <h2>{t('Household size mix')}</h2>
            <Link to="/families">{t('View families')}</Link>
          </div>
          <MixBars items={famStats.sizeBands} accent="amber" />
          <p className="mix-foot muted small">
            {famStats.withUnlinked.toLocaleString()} {t('houses have unlinked electors (same house, no name match)')}
          </p>
        </article>
      </section>

      <section className="split">
        <article className="panel">
          <div className="panel-head">
            <h2>{t('Largest households')}</h2>
            <Link to="/families">{t('All families')}</Link>
          </div>
          <div className="table-wrap flat">
            <table className="voter-table">
              <thead>
                <tr>
                  <th>{t('Part')}</th>
                  <th>{t('House')}</th>
                  <th>{t('Head')}</th>
                  <th>{t('Size')}</th>
                  <th>{t('Unlinked')}</th>
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
                    <td>
                      <TeText value={f.headName} />
                    </td>
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

        <article className="panel">
          <div className="panel-head">
            <h2>{t('Key PDF → Excel columns')}</h2>
            <span className="muted">{t('Coverage')}</span>
          </div>
          <div className="table-wrap flat">
            <table className="voter-table">
              <thead>
                <tr>
                  <th>{t('Column')}</th>
                  <th>{t('Mapped')}</th>
                  <th>{t('Coverage')}</th>
                </tr>
              </thead>
              <tbody>
                {(stats.fieldCoverage || []).map((f) => (
                  <tr key={f.field}>
                    <td>{f.field}</td>
                    <td>{f.count.toLocaleString()}</td>
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
      </section>

      <section className="panel part-electors-panel">
        <div className="panel-head">
          <h2>{t('Electors by polling station')}</h2>
          <Link to="/parts">{t('View parts')}</Link>
        </div>
        <PartElectorsChart voters={voters} total={stats.total} />
      </section>

      <SectionMapping voters={voters} totalElectors={stats.total} />
    </div>
  )
}
