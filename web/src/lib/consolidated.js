/** Build part / polling-station rollups + cross-checks for consolidated dashboard. */

function serialGaps(serials) {
  const nums = serials.filter((n) => Number.isFinite(n)).map(Number).sort((a, b) => a - b)
  if (!nums.length) return { min: null, max: null, gaps: 0, gapList: [], dups: 0 }
  const seen = new Set()
  let dups = 0
  for (const n of nums) {
    if (seen.has(n)) dups += 1
    else seen.add(n)
  }
  const min = nums[0]
  const max = nums[nums.length - 1]
  const gapList = []
  for (let i = min; i <= max; i++) {
    if (!seen.has(i)) gapList.push(i)
  }
  return { min, max, gaps: gapList.length, gapList: gapList.slice(0, 12), dups }
}

export function buildConsolidated(voters, families, stats, famStats) {
  const byPart = new Map()
  for (const p of stats.parts || []) {
    byPart.set(Number(p.part), {
      part: p.part,
      electors: p.total,
      male: p.male,
      female: p.female,
      unknownGender: Math.max(0, p.total - p.male - p.female),
      avgAge: p.avgAge,
      femaleShare: p.femaleShare,
      pollingStationName: p.pollingStationName || '—',
      district: p.district || '',
      tehsilMandal: p.tehsilMandal || '',
      pinCode: p.pinCode || '',
      netTotal: p.netTotal ?? null,
      netMale: p.netMale ?? null,
      netFemale: p.netFemale ?? null,
      sections: 0,
      households: 0,
      multiHouseholds: 0,
      links: 0,
      unlinked: 0,
      largeFamilies: 0,
      missingSerial: 0,
      missingRelation: 0,
      missingAge: 0,
      missingGender: 0,
      serials: [],
      epics: [],
    })
  }

  const sectionKeys = new Set()
  const epicGlobal = new Map()

  for (const v of voters) {
    const part = Number(v.part)
    const row = byPart.get(part)
    if (!row) continue
    const sk = `${part}|${v.section || v.sectionNo}`
    if (!sectionKeys.has(sk)) {
      sectionKeys.add(sk)
      row.sections += 1
    }
    if (v.pollingStationName) row.pollingStationName = v.pollingStationName
    if (row.netTotal == null && v.netTotal != null) row.netTotal = v.netTotal
    if (row.netMale == null && v.netMale != null) row.netMale = v.netMale
    if (row.netFemale == null && v.netFemale != null) row.netFemale = v.netFemale

    if (v.serial == null && !v.serialRaw) row.missingSerial += 1
    else if (v.serial != null) row.serials.push(v.serial)

    if (!v.relationType || !v.relationName) row.missingRelation += 1
    if (v.age == null) row.missingAge += 1
    if (!v.gender) row.missingGender += 1

    if (v.epic) {
      row.epics.push(v.epic)
      epicGlobal.set(v.epic, (epicGlobal.get(v.epic) || 0) + 1)
    }
  }

  for (const f of families) {
    const row = byPart.get(Number(f.part))
    if (!row) continue
    row.households += 1
    if (f.size >= 2) row.multiHouseholds += 1
    if (f.size >= 5) row.largeFamilies += 1
    row.links += f.linkedCount || 0
    row.unlinked += f.unlinkedCount || 0
  }

  const parts = [...byPart.values()]
    .map((p) => {
      const serialInfo = serialGaps(p.serials)
      const deltaTotal =
        p.netTotal != null && Number.isFinite(Number(p.netTotal))
          ? p.electors - Number(p.netTotal)
          : null
      const deltaMale =
        p.netMale != null && Number.isFinite(Number(p.netMale)) ? p.male - Number(p.netMale) : null
      const deltaFemale =
        p.netFemale != null && Number.isFinite(Number(p.netFemale))
          ? p.female - Number(p.netFemale)
          : null

      const flags = []
      if (deltaTotal != null && deltaTotal !== 0) flags.push('count')
      if (deltaMale != null && deltaMale !== 0) flags.push('male')
      if (deltaFemale != null && deltaFemale !== 0) flags.push('female')
      if (serialInfo.gaps > 0) flags.push('serial-gap')
      if (serialInfo.dups > 0) flags.push('serial-dup')
      if (p.missingSerial > 0) flags.push('serial-miss')
      if (p.missingGender > 0) flags.push('gender-miss')
      if (p.missingRelation > 0) flags.push('relation-miss')

      const status =
        flags.length === 0
          ? 'ok'
          : flags.some((f) => f === 'count' || f === 'serial-dup')
            ? 'warn'
            : 'info'

      return {
        ...p,
        serialMin: serialInfo.min,
        serialMax: serialInfo.max,
        serialGaps: serialInfo.gaps,
        serialGapSample: serialInfo.gapList,
        serialDups: serialInfo.dups,
        deltaTotal,
        deltaMale,
        deltaFemale,
        flags,
        status,
        // drop heavy arrays from UI payload
        serials: undefined,
        epics: undefined,
      }
    })
    .sort((a, b) => Number(a.part) - Number(b.part))

  const byStation = new Map()
  for (const v of voters) {
    const key = v.pollingStationName || 'Unmapped station'
    if (!byStation.has(key)) {
      byStation.set(key, {
        name: key,
        electors: 0,
        male: 0,
        female: 0,
        parts: new Set(),
        households: new Set(),
      })
    }
    const s = byStation.get(key)
    s.electors += 1
    if (v.gender === 'Male') s.male += 1
    if (v.gender === 'Female') s.female += 1
    if (v.part != null) s.parts.add(v.part)
    if (v.house) s.households.add(`${v.part}|${v.house}`)
  }

  const stations = [...byStation.values()]
    .map((s) => ({
      name: s.name,
      electors: s.electors,
      male: s.male,
      female: s.female,
      femalePct: s.electors ? Math.round((s.female / s.electors) * 1000) / 10 : 0,
      partsCount: s.parts.size,
      parts: [...s.parts].sort((a, b) => a - b).join(', '),
      households: s.households.size,
    }))
    .sort((a, b) => b.electors - a.electors)

  const linkRate =
    famStats.totalLinks + famStats.totalUnlinked > 0
      ? Math.round((famStats.totalLinks / (famStats.totalLinks + famStats.totalUnlinked)) * 1000) / 10
      : 0

  const genderMix = [
    { band: 'Male', count: stats.male, pct: stats.total ? Math.round((stats.male / stats.total) * 1000) / 10 : 0 },
    {
      band: 'Female',
      count: stats.female,
      pct: stats.total ? Math.round((stats.female / stats.total) * 1000) / 10 : 0,
    },
    {
      band: 'Unknown',
      count: stats.unknownGender || 0,
      pct: stats.total ? Math.round(((stats.unknownGender || 0) / stats.total) * 1000) / 10 : 0,
    },
  ].filter((g) => g.count > 0)

  const gMax = Math.max(1, ...genderMix.map((g) => g.count))
  for (const g of genderMix) g.bar = Math.round((g.count / gMax) * 100)

  const netSum = parts.reduce((s, p) => s + (Number(p.netTotal) || 0), 0)
  const extractedSum = parts.reduce((s, p) => s + p.electors, 0)
  const totalDelta = extractedSum - netSum
  const partsWithDelta = parts.filter((p) => p.deltaTotal != null && p.deltaTotal !== 0).length
  const totalSerialGaps = parts.reduce((s, p) => s + (p.serialGaps || 0), 0)
  const totalMissingSerial = parts.reduce((s, p) => s + (p.missingSerial || 0), 0)
  const totalMissingRelation = parts.reduce((s, p) => s + (p.missingRelation || 0), 0)
  const totalMissingGender = parts.reduce((s, p) => s + (p.missingGender || 0), 0)
  const totalMissingAge = parts.reduce((s, p) => s + (p.missingAge || 0), 0)
  const duplicateEpics = [...epicGlobal.values()].filter((c) => c > 1).length
  const issues = parts.filter((p) => p.status !== 'ok').length

  const checks = [
    {
      id: 'extract-vs-net',
      label: 'Extracted vs roll net total',
      detail:
        totalDelta === 0
          ? `Match · ${extractedSum.toLocaleString()} electors`
          : `${Math.abs(totalDelta)} short of cover net across ${partsWithDelta} parts`,
      ok: totalDelta === 0,
      severity: totalDelta === 0 ? 'ok' : 'warn',
      value: totalDelta === 0 ? 'OK' : `${totalDelta}`,
    },
    {
      id: 'serial-gaps',
      label: 'S.No continuity gaps',
      detail:
        totalSerialGaps === 0
          ? 'No gaps inside min–max per part'
          : `${totalSerialGaps} missing serials inside part ranges`,
      ok: totalSerialGaps === 0,
      severity: totalSerialGaps === 0 ? 'ok' : 'info',
      value: String(totalSerialGaps),
    },
    {
      id: 'serial-miss',
      label: 'Missing S.No values',
      detail: totalMissingSerial === 0 ? 'All electors have S.No' : `${totalMissingSerial} rows without S.No`,
      ok: totalMissingSerial === 0,
      severity: totalMissingSerial === 0 ? 'ok' : 'warn',
      value: String(totalMissingSerial),
    },
    {
      id: 'epic-unique',
      label: 'EPIC uniqueness',
      detail: duplicateEpics === 0 ? 'No duplicate EPICs' : `${duplicateEpics} EPIC values repeated`,
      ok: duplicateEpics === 0,
      severity: duplicateEpics === 0 ? 'ok' : 'warn',
      value: duplicateEpics === 0 ? 'OK' : String(duplicateEpics),
    },
    {
      id: 'gender-miss',
      label: 'Missing gender',
      detail: totalMissingGender === 0 ? 'All gendered' : `${totalMissingGender} without gender`,
      ok: totalMissingGender === 0,
      severity: totalMissingGender === 0 ? 'ok' : 'info',
      value: String(totalMissingGender),
    },
    {
      id: 'relation-miss',
      label: 'Missing relation fields',
      detail:
        totalMissingRelation === 0
          ? 'All have relation type + name'
          : `${totalMissingRelation} missing relation type/name`,
      ok: totalMissingRelation === 0,
      severity: totalMissingRelation === 0 ? 'ok' : 'info',
      value: String(totalMissingRelation),
    },
    {
      id: 'age-miss',
      label: 'Missing age',
      detail: totalMissingAge === 0 ? 'All ages present' : `${totalMissingAge} without age`,
      ok: totalMissingAge === 0,
      severity: totalMissingAge === 0 ? 'ok' : 'info',
      value: String(totalMissingAge),
    },
    {
      id: 'family-cover',
      label: 'Household coverage',
      detail: `${famStats.households.toLocaleString()} houses · ${famStats.coveredVoters.toLocaleString()} electors housed`,
      ok: famStats.uncoveredVoters === 0,
      severity: famStats.uncoveredVoters === 0 ? 'ok' : 'warn',
      value: famStats.uncoveredVoters === 0 ? 'OK' : String(famStats.uncoveredVoters),
    },
  ]

  const missingSummary = (stats.fieldCoverage || []).filter((f) => f.pct < 100)

  return {
    parts,
    stations,
    linkRate,
    genderMix,
    checks,
    missingSummary,
    crossCheck: {
      extractedSum,
      netSum,
      totalDelta,
      partsWithDelta,
      totalSerialGaps,
      totalMissingSerial,
      totalMissingRelation,
      totalMissingGender,
      totalMissingAge,
      duplicateEpics,
      issues,
      okCount: checks.filter((c) => c.ok).length,
      checkCount: checks.length,
    },
    totals: {
      electors: stats.total,
      parts: stats.partsCount,
      sections: stats.sectionsCount,
      households: famStats.households,
      multi: famStats.multi,
      links: famStats.totalLinks,
      unlinked: famStats.totalUnlinked,
      avgFamilySize: famStats.avgSize,
      femalePct: stats.femalePct,
      avgAge: stats.avgAge,
      serialPct: stats.serialCoveragePct,
    },
  }
}
