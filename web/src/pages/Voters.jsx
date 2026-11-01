import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import FiltersBar from '../components/FiltersBar'
import VoterTable from '../components/VoterTable'
import { useVoterData } from '../context/VoterData'

export default function Voters() {
  const { loading, error, filtered, stats, filters, setSectionNo } = useVoterData()

  useEffect(() => {
    setSectionNo('')
  }, [setSectionNo])

  if (loading) return <p className="state">Loading Excel…</p>
  if (error) return <p className="state error">{error}</p>

  const male = filtered.filter((v) => v.gender === 'Male').length
  const female = filtered.filter((v) => v.gender === 'Female').length
  const withSerial = filtered.filter((v) => v.serial != null).length

  return (
    <div className="stack">
      <div className="crumb">
        <Link to="/">{stats.constituency}</Link>
        <span>/</span>
        <strong>Voters</strong>
      </div>

      <header className="page-head voters-head">
        <div>
          <h1>Voters</h1>
          <p className="lede">
            Full directory · click name or EPIC for details · filter by part, PC, station, gender, age
          </p>
        </div>
        <div className="voters-chips">
          <span className="v-chip">
            <em>{filtered.length.toLocaleString()}</em> shown
          </span>
          <span className="v-chip">
            <em>{male.toLocaleString()}</em> M
          </span>
          <span className="v-chip">
            <em>{female.toLocaleString()}</em> F
          </span>
          <span className="v-chip">
            <em>{withSerial.toLocaleString()}</em> with S.No
          </span>
          {filters.part ? <span className="v-chip is-active">Part {filters.part}</span> : null}
          {filters.pcs?.length ? (
            <span className="v-chip is-active">{filters.pcs.length} PC</span>
          ) : null}
          {filters.pollingStations?.length === 1 ? (
            <span className="v-chip is-active" title={filters.pollingStations[0]}>
              {filters.pollingStations[0].length > 36
                ? `${filters.pollingStations[0].slice(0, 35)}…`
                : filters.pollingStations[0]}
            </span>
          ) : filters.pollingStations?.length > 1 ? (
            <span className="v-chip is-active">{filters.pollingStations.length} stations</span>
          ) : null}
        </div>
      </header>

      <FiltersBar showSection={false} />
      <VoterTable
        rows={filtered}
        pageSize={100}
        exportName="kukatpally_voters_filtered.csv"
        showSection={false}
      />
    </div>
  )
}
