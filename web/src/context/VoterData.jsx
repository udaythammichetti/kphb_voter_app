import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { buildFamilies, familyStats, filterFamilies } from '../lib/families'
import { computeStats, filterVoters, loadVotersFromExcel } from '../lib/loadVoters'

const VoterDataContext = createContext(null)

export function VoterDataProvider({ children }) {
  const [voters, setVoters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [part, setPart] = useState('')
  const [sectionNo, setSectionNo] = useState('')
  const [gender, setGender] = useState('')
  const [ageBand, setAgeBand] = useState('')
  const [pcs, setPcs] = useState([])
  const [pollingStations, setPollingStations] = useState([])
  const [familyQ, setFamilyQ] = useState('')
  const [familyMinSize, setFamilyMinSize] = useState(0)
  const [familyOnlyUnlinked, setFamilyOnlyUnlinked] = useState(false)
  const [selectedVoter, setSelectedVoter] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        setError('')
        const rows = await loadVotersFromExcel('/data/voters_all.xlsx')
        if (!alive) return
        setVoters(rows)
      } catch (e) {
        if (!alive) return
        console.error(e)
        setError(e.message || 'Failed to load voter Excel')
        setVoters([])
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const clearFilters = useCallback(() => {
    setQ('')
    setPart('')
    setSectionNo('')
    setGender('')
    setAgeBand('')
    setPcs([])
    setPollingStations([])
    setFamilyQ('')
    setFamilyMinSize(0)
    setFamilyOnlyUnlinked(false)
  }, [])

  const getVoter = useCallback(
    (epic) => {
      if (!epic) return null
      const key = String(epic).toUpperCase()
      return voters.find((v) => v.epic === key) || null
    },
    [voters],
  )

  const openVoter = useCallback(
    (voterOrEpic) => {
      if (!voterOrEpic) {
        setSelectedVoter(null)
        return
      }
      if (typeof voterOrEpic === 'object' && voterOrEpic.epic) {
        setSelectedVoter(getVoter(voterOrEpic.epic) || voterOrEpic)
        return
      }
      setSelectedVoter(getVoter(voterOrEpic))
    },
    [getVoter],
  )

  const closeVoter = useCallback(() => setSelectedVoter(null), [])

  const stats = useMemo(() => computeStats(voters), [voters])
  const families = useMemo(() => buildFamilies(voters), [voters])
  const famStats = useMemo(() => familyStats(families, voters.length), [families, voters.length])

  const filtered = useMemo(() => {
    const looksFullSection = String(sectionNo).includes('-')
    return filterVoters(voters, {
      q,
      part,
      section: looksFullSection ? sectionNo : '',
      sectionNo: looksFullSection ? '' : sectionNo,
      gender,
      ageBand,
      pcs,
      pollingStations,
    })
  }, [voters, q, part, sectionNo, gender, ageBand, pcs, pollingStations])

  const filteredFamilies = useMemo(
    () =>
      filterFamilies(families, {
        q: familyQ,
        part,
        minSize: familyMinSize,
        onlyUnlinked: familyOnlyUnlinked,
      }),
    [families, familyQ, part, familyMinSize, familyOnlyUnlinked],
  )

  const value = useMemo(
    () => ({
      voters,
      filtered,
      stats,
      families,
      famStats,
      filteredFamilies,
      loading,
      error,
      filters: {
        q,
        part,
        sectionNo,
        gender,
        ageBand,
        pcs,
        pollingStations,
        familyQ,
        familyMinSize,
        familyOnlyUnlinked,
      },
      setQ,
      setPart,
      setSectionNo,
      setGender,
      setAgeBand,
      setPcs,
      setPollingStations,
      setFamilyQ,
      setFamilyMinSize,
      setFamilyOnlyUnlinked,
      clearFilters,
      getFamily: (id) => families.find((f) => f.id === id) || null,
      getVoter,
      selectedVoter,
      openVoter,
      closeVoter,
    }),
    [
      voters,
      filtered,
      stats,
      families,
      famStats,
      filteredFamilies,
      loading,
      error,
      q,
      part,
      sectionNo,
      gender,
      ageBand,
      pcs,
      pollingStations,
      familyQ,
      familyMinSize,
      familyOnlyUnlinked,
      clearFilters,
      getVoter,
      selectedVoter,
      openVoter,
      closeVoter,
    ],
  )

  return <VoterDataContext.Provider value={value}>{children}</VoterDataContext.Provider>
}

export function useVoterData() {
  const ctx = useContext(VoterDataContext)
  if (!ctx) throw new Error('useVoterData must be used within VoterDataProvider')
  return ctx
}
