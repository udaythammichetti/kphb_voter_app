import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import VoterDetailModal from './VoterDetailModal'
import { useLocale } from '../context/Locale'
import { useVoterData } from '../context/VoterData'

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/voters', label: 'Voters' },
  { to: '/families', label: 'Families' },
  { to: '/parts', label: 'Parts' },
  { to: '/consolidated', label: 'Consolidated' },
]

function titleForPath(pathname) {
  if (pathname === '/') return 'Dashboard'
  if (pathname.startsWith('/voters')) return 'Voters'
  if (pathname.startsWith('/families')) return 'Families'
  if (pathname.startsWith('/consolidated')) return 'Consolidated'
  if (pathname.includes('/sections/')) return 'Section'
  if (pathname.startsWith('/parts/')) return 'Part'
  if (pathname.startsWith('/parts')) return 'Parts'
  return 'KPHP Roll'
}

export default function Shell() {
  const { loading, voters, stats, famStats } = useVoterData()
  const { lang, setLanguage, t } = useLocale()
  const { pathname } = useLocation()

  useEffect(() => {
    document.title = `${t(titleForPath(pathname))} · Kukatpally 46`
    document.documentElement.lang = lang === 'te' ? 'te' : 'en'
  }, [pathname, lang, t])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <p className="brand-mark">KPHP Roll</p>
          <p className="brand-sub">
            46 · Kukatpally · Draft Roll 2026
            {!loading ? (
              <>
                {' '}
                · <strong>{voters.length.toLocaleString()}</strong> {t('electors')} · {stats.partsCount}{' '}
                {t('parts')} · {famStats.households.toLocaleString()} {t('Households').toLowerCase()}
              </>
            ) : (
              ' · loading Excel…'
            )}
          </p>
        </div>
        <div className="topbar-right">
          <div className="lang-toggle" role="group" aria-label="Language">
            <button
              type="button"
              className={lang === 'en' ? 'is-active' : ''}
              onClick={() => setLanguage('en')}
            >
              EN
            </button>
            <button
              type="button"
              className={lang === 'te' ? 'is-active' : ''}
              onClick={() => setLanguage('te')}
            >
              తెలుగు
            </button>
          </div>
          <nav className="nav-links" aria-label="Primary">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => (isActive ? 'nav active' : 'nav')}
              >
                {t(l.label)}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <p className="print-only print-banner">
        KPHP Roll · 46 Kukatpally · {lang === 'te' ? 'తెలుగు' : 'English'} ·{' '}
        {t(titleForPath(pathname))}
      </p>
      <main className="page">
        <Outlet />
      </main>
      <VoterDetailModal />
    </div>
  )
}
