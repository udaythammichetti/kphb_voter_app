import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { houseKey } from '../lib/families'
import { useLocale } from '../context/Locale'
import { useVoterData } from '../context/VoterData'
import TeText from './TeText'

function Row({ label, children }) {
  if (children == null || children === '') return null
  return (
    <div className="vd-row">
      <span className="vd-label">{label}</span>
      <span className="vd-value">{children}</span>
    </div>
  )
}

export default function VoterDetailModal() {
  const { selectedVoter: v, closeVoter } = useVoterData()
  const { t } = useLocale()

  useEffect(() => {
    if (!v) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') closeVoter()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [v, closeVoter])

  if (!v) return null

  const familyId = v.house ? houseKey(v.part, v.house) : null

  return (
    <div className="vd-backdrop" onClick={closeVoter} role="presentation">
      <aside
        className="vd-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Voter ${v.name || v.epic}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="vd-head">
          <div>
            <p className="vd-eyebrow">Elector detail</p>
            <h2>
              <TeText value={v.name || '—'} />
            </h2>
            <p className="mono vd-epic">{v.epic || '—'}</p>
          </div>
          <button type="button" className="ghost-btn vd-close" onClick={closeVoter} aria-label="Close">
            Close
          </button>
        </header>

        <div className="vd-grid">
          <section className="vd-block">
            <h3>Roll identity</h3>
            <Row label="S.No">{v.serial ?? v.serialRaw ?? '—'}</Row>
            <Row label="EPIC">
              <span className="mono">{v.epic || '—'}</span>
            </Row>
            <Row label={t('Name')}>
              <TeText value={v.name || '—'} />
            </Row>
            <Row label={t('Age')}>{v.age != null ? `${v.age} yrs (${v.ageBand})` : '—'}</Row>
            <Row label={t('Gender')}>{v.gender ? t(v.gender) : '—'}</Row>
            <Row label={t('Relation')}>
              {v.relationType ? (
                <>
                  {t(v.relationType)}: <TeText value={v.relationName || '—'} />
                </>
              ) : (
                '—'
              )}
            </Row>
            <Row label="House No.">
              {familyId ? (
                <Link className="cell-link" to={`/families/${encodeURIComponent(familyId)}`} onClick={closeVoter}>
                  {v.house}
                </Link>
              ) : (
                v.house || '—'
              )}
            </Row>
          </section>

          <section className="vd-block">
            <h3>Hierarchy</h3>
            <Row label="AC">{v.constituency || '—'}</Row>
            <Row label="Part">
              {v.part != null ? (
                <Link className="cell-link" to={`/parts/${v.part}`} onClick={closeVoter}>
                  Part {v.part}
                </Link>
              ) : (
                '—'
              )}
            </Row>
            <Row label="Section">
              {v.section ? (
                <Link
                  className="cell-link"
                  to={`/parts/${v.part}/sections/${encodeURIComponent(v.section)}`}
                  onClick={closeVoter}
                >
                  {v.section}
                </Link>
              ) : (
                '—'
              )}
            </Row>
            <Row label="Section No">{v.sectionNo || '—'}</Row>
            <Row label="PDF page">{v.page || '—'}</Row>
            <Row label="Source PDF">
              <span className="muted small">{v.source || '—'}</span>
            </Row>
          </section>

          <section className="vd-block">
            <h3>Cover / locality</h3>
            <Row label="Assembly">{v.constituencyLabel || '—'}</Row>
            <Row label="PC">{v.parliamentaryConstituency || '—'}</Row>
            <Row label="District">{v.district || '—'}</Row>
            <Row label="Subdivision">{v.subdivision || '—'}</Row>
            <Row label="Mandal">{v.tehsilMandal || '—'}</Row>
            <Row label="Town / village">{v.mainTown || '—'}</Row>
            <Row label="Post office">{v.postOffice || '—'}</Row>
            <Row label="Police station">{v.policeStation || '—'}</Row>
            <Row label="PIN">{v.pinCode || '—'}</Row>
          </section>

          <section className="vd-block">
            <h3>Polling station</h3>
            <Row label="Name">{v.pollingStationName || '—'}</Row>
            <Row label="Address">{v.pollingStationAddress || '—'}</Row>
            <Row label="Type">{v.pollingStationType || '—'}</Row>
            <Row label="Revision">{v.typeOfRevision || '—'}</Row>
            <Row label="Year">{v.yearOfRevision || '—'}</Row>
            <Row label="Qualifying date">{v.qualifyingDate || '—'}</Row>
            <Row label="Publication">{v.dateOfPublication || '—'}</Row>
          </section>
        </div>

        <footer className="vd-foot">
          {familyId ? (
            <Link className="secondary-btn" to={`/families/${encodeURIComponent(familyId)}`} onClick={closeVoter}>
              Open family tree
            </Link>
          ) : null}
          <Link className="ghost-btn" to="/voters" onClick={closeVoter}>
            All voters
          </Link>
        </footer>
      </aside>
    </div>
  )
}
