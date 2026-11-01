import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { houseKey } from '../lib/families'
import { useLocale } from '../context/Locale'
import { useVoterData } from '../context/VoterData'
import ExportPrintBar from './ExportPrintBar'
import TeText from './TeText'

const PAGE_SIZE_OPTIONS = [50, 100, 250, 500, 1000]

export default function VoterTable({
  rows,
  pageSize: initialPageSize = 100,
  exportName = 'voters_filtered.csv',
  showSection = true,
}) {
  const { openVoter } = useVoterData()
  const { t } = useLocale()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)

  useEffect(() => {
    setPage(1)
  }, [rows, pageSize])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)

  const slice = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return rows.slice(start, start + pageSize)
  }, [rows, safePage, pageSize])

  if (!rows.length) {
    return <p className="empty">No voters match the current filters.</p>
  }

  return (
    <div className="table-wrap">
      <div className="table-toolbar">
        <p className="table-note tight">
          Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, rows.length)} of{' '}
          <strong>{rows.length.toLocaleString()}</strong> mapped electors
        </p>
        <div className="table-toolbar-actions">
          <ExportPrintBar rows={rows} exportName={exportName} />
          <label className="page-size">
            {t('Rows')}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <table className="voter-table">
        <thead>
          <tr>
            <th>{t('Part')}</th>
            {showSection ? <th>Section</th> : null}
            <th>S.No</th>
            <th>EPIC</th>
            <th>{t('Name')}</th>
            <th>{t('Relation')}</th>
            <th>{t('House No')}</th>
            <th>{t('Age')}</th>
            <th>{t('Gender')}</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((v, i) => (
            <tr key={`${v.epic}-${v.part}-${v.serial}-${i}`}>
              <td>
                <Link className="cell-link" to={`/parts/${v.part}`}>
                  {v.part ?? '—'}
                </Link>
              </td>
              {showSection ? (
                <td>
                  {v.section ? (
                    <Link
                      className="cell-link"
                      to={`/parts/${v.part}/sections/${encodeURIComponent(v.section)}`}
                      title={`Section No and Name ${v.section}`}
                    >
                      {v.section}
                    </Link>
                  ) : v.sectionNo ? (
                    <Link className="cell-link" to={`/parts/${v.part}/sections/${v.sectionNo}`}>
                      {v.sectionNo}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
              ) : null}
              <td className="mono sno-cell">{v.serial ?? v.serialRaw ?? '—'}</td>
              <td className="mono">
                {v.epic ? (
                  <button type="button" className="cell-btn mono" onClick={() => openVoter(v)}>
                    {v.epic}
                  </button>
                ) : (
                  '—'
                )}
              </td>
              <td className="name-cell">
                {v.name ? (
                  <button type="button" className="cell-btn name-btn" onClick={() => openVoter(v)}>
                    <TeText value={v.name} />
                  </button>
                ) : (
                  '—'
                )}
              </td>
              <td>
                {v.relationType ? (
                  <span className="muted">
                    {t(v.relationType)}: <TeText value={v.relationName || '—'} />
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td>
                {v.house ? (
                  <Link className="cell-link" to={`/families/${encodeURIComponent(houseKey(v.part, v.house))}`}>
                    {v.house}
                  </Link>
                ) : (
                  '—'
                )}
              </td>
              <td>{v.age ?? '—'}</td>
              <td>{v.gender ? t(v.gender) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pager no-print">
        <button type="button" className="ghost-btn" disabled={safePage <= 1} onClick={() => setPage(1)}>
          {t('First')}
        </button>
        <button
          type="button"
          className="ghost-btn"
          disabled={safePage <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          {t('Prev')}
        </button>
        <span>
          {t('Page')} {safePage} / {totalPages}
        </span>
        <button
          type="button"
          className="ghost-btn"
          disabled={safePage >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          {t('Next')}
        </button>
        <button
          type="button"
          className="ghost-btn"
          disabled={safePage >= totalPages}
          onClick={() => setPage(totalPages)}
        >
          {t('Last')}
        </button>
      </div>
    </div>
  )
}
