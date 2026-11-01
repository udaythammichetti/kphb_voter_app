/** Aggregate electors by polling station (merge parts that share a station). */

import { normalizeStationKey } from './loadVoters'

export function normalizeBoothName(name) {
  return normalizeStationKey(name)
}

export function shortBoothLabel(name, max = 28) {
  const n = normalizeBoothName(name)
  if (n.length <= max) return n
  return `${n.slice(0, max - 1)}…`
}

export function buildBoothRollup(voters) {
  const map = new Map()
  for (const v of voters) {
    const key = normalizeStationKey(v.pollingStationName)
    if (!map.has(key)) {
      map.set(key, {
        name: key,
        rawName: v.pollingStationName || key,
        address: v.pollingStationAddress || '',
        type: v.pollingStationType || '',
        short: shortBoothLabel(key),
        total: 0,
        male: 0,
        female: 0,
        avgAgeSum: 0,
        ageCount: 0,
        youth: 0,
        senior: 0,
        parts: new Set(),
        sections: new Set(),
        houses: new Set(),
      })
    }
    const row = map.get(key)
    row.total += 1
    if (v.gender === 'Male') row.male += 1
    if (v.gender === 'Female') row.female += 1
    if (v.age != null) {
      row.avgAgeSum += v.age
      row.ageCount += 1
      if (v.age < 35) row.youth += 1
      if (v.age >= 60) row.senior += 1
    }
    if (v.part != null) row.parts.add(Number(v.part))
    const sectionKey = v.section || v.sectionNo || v.sectionName
    if (sectionKey) row.sections.add(`${v.part ?? 'x'}|${sectionKey}`)
    if (v.house) row.houses.add(String(v.house).toLowerCase())
    if (!row.address && v.pollingStationAddress) row.address = v.pollingStationAddress
    if (!row.type && v.pollingStationType) row.type = v.pollingStationType
    if (!row.rawName && v.pollingStationName) row.rawName = v.pollingStationName
  }

  return [...map.values()]
    .map((b) => {
      const parts = [...b.parts].sort((a, c) => a - c)
      return {
        name: b.name,
        rawName: b.rawName,
        address: b.address,
        type: b.type || 'GENERAL',
        short: b.short,
        total: b.total,
        male: b.male,
        female: b.female,
        femaleShare: b.total ? Math.round((b.female / b.total) * 1000) / 10 : 0,
        avgAge: b.ageCount ? Math.round((b.avgAgeSum / b.ageCount) * 10) / 10 : 0,
        youthPct: b.total ? Math.round((b.youth / b.total) * 1000) / 10 : 0,
        seniorPct: b.total ? Math.round((b.senior / b.total) * 1000) / 10 : 0,
        households: b.houses.size,
        sectionsCount: b.sections.size,
        parts,
        partsLabel: parts.map((p) => `P${p}`).join(', '),
        part: parts.length === 1 ? parts[0] : null,
      }
    })
    .sort((a, b) => b.total - a.total)
}
