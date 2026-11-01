import { useMemo } from 'react'
import MultiSelect from './MultiSelect'
import { normalizeStationKey } from '../lib/loadVoters'
import { useVoterData } from '../context/VoterData'

export default function FiltersBar({ showPart = true, showSection = true, lockPart = null }) {
  const {
    stats,
    voters,
    filters,
    setQ,
    setPart,
    setSectionNo,
    setGender,
    setAgeBand,
    setPcs,
    setPollingStations,
    clearFilters,
  } = useVoterData()

  const sectionOptions = useMemo(() => {
    const partFilter = lockPart ?? filters.part
    const map = new Map()
    for (const v of voters) {
      if (partFilter !== '' && partFilter != null && Number(v.part) !== Number(partFilter)) continue
      if (!v.section) continue
      const key = v.section
      if (!map.has(key)) {
        const label =
          partFilter === '' || partFilter == null ? `Part ${v.part} · ${v.section}` : v.section
        map.set(key, label)
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }))
  }, [voters, filters.part, lockPart])

  // Normalized station keys so pie-click filters match MultiSelect options
  const pollingOptions = useMemo(() => {
    const partFilter = lockPart ?? filters.part
    const map = new Map()
    for (const v of voters) {
      if (partFilter !== '' && partFilter != null && Number(v.part) !== Number(partFilter)) continue
      const key = normalizeStationKey(v.pollingStationName)
      map.set(key, (map.get(key) || 0) + 1)
    }
    return [...map.entries()]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
  }, [voters, filters.part, lockPart])

  return (
    <div className="filters no-print">
      <label className="filter-field grow">
        <span>Search</span>
        <input
          value={filters.q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="S.No, name, EPIC, house, section, PC…"
        />
      </label>
      {showPart ? (
        <label className="filter-field">
          <span>Part</span>
          <select
            value={filters.part}
            onChange={(e) => {
              setPart(e.target.value)
              setSectionNo('')
              // Keep station filter — only clear if new part has no overlap
            }}
          >
            <option value="">All parts</option>
            {stats.parts.map((p) => (
              <option key={p.part} value={p.part}>
                Part {p.part}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {showSection ? (
        <label className="filter-field" style={{ minWidth: 220 }}>
          <span>Section No and Name</span>
          <select value={filters.sectionNo} onChange={(e) => setSectionNo(e.target.value)}>
            <option value="">All sections</option>
            {sectionOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <MultiSelect
        label="PC"
        options={stats.pcs || []}
        value={filters.pcs || []}
        onChange={setPcs}
        placeholder="All PCs"
      />

      <MultiSelect
        label="Polling station"
        options={pollingOptions}
        value={filters.pollingStations || []}
        onChange={setPollingStations}
        placeholder="All stations"
        wide
      />

      <label className="filter-field">
        <span>Gender</span>
        <select value={filters.gender} onChange={(e) => setGender(e.target.value)}>
          <option value="">All</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
      </label>
      <label className="filter-field">
        <span>Age band</span>
        <select value={filters.ageBand} onChange={(e) => setAgeBand(e.target.value)}>
          <option value="">All</option>
          {stats.ageBands.map((b) => (
            <option key={b.band} value={b.band}>
              {b.band}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="ghost-btn" onClick={clearFilters}>
        Reset
      </button>
    </div>
  )
}
