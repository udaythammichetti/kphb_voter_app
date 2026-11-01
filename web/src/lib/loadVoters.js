import * as XLSX from 'xlsx'

const PART_RE = /ENG-(\d+)-WI/i

function cleanStr(v) {
  if (v == null || v === '') return ''
  const s = String(v).trim()
  return s === 'nan' || s === 'NaN' ? '' : s
}

function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function ageBand(age) {
  if (age == null) return 'Unknown'
  if (age <= 25) return '18–25'
  if (age <= 35) return '26–35'
  if (age <= 45) return '36–45'
  if (age <= 55) return '46–55'
  if (age <= 65) return '56–65'
  return '65+'
}

export function normalizeRow(raw) {
  const source = cleanStr(raw.source_pdf || raw.source)
  const partFromFile = source.match(PART_RE)
  const part =
    toNum(raw.part_no) ??
    toNum(raw.part) ??
    (partFromFile ? Number(partFromFile[1]) : null)

  const age = toNum(raw.age)
  let gender = cleanStr(raw.gender)
  if (gender !== 'Male' && gender !== 'Female') gender = ''

  // Page-start header fields (every voter page):
  //   Assembly Constituency No and Name: 46-KUKATPALLY
  //   Section No and Name 1-Dayarguda 5-6-1 To 5-6-34
  const sectionRaw =
    cleanStr(raw.section) ||
    [cleanStr(raw.section_no), cleanStr(raw.section_name)].filter(Boolean).join('-')
  const sectionNo = cleanStr(raw.section_no) || (sectionRaw.match(/^(\d+)/)?.[1] ?? '')
  const sectionName =
    cleanStr(raw.section_name) ||
    sectionRaw.replace(/^\d+\s*[-–]?\s*/, '').trim() ||
    'Unmapped section'
  const section =
    sectionRaw ||
    (sectionNo ? `${sectionNo}-${sectionName}` : '') ||
    'Unmapped section'

  // Prefer page-header AC text (46-KUKATPALLY), keep cover label separately
  const pageConstituency = cleanStr(raw.constituency).replace(/\s+/g, '') || '46-KUKATPALLY'
  const coverConstituency =
    cleanStr(raw.assembly_constituency) || '46 - KUKATPALLY (GENERAL)'

  return {
    part,
    // canonical link key from page header
    constituency: pageConstituency.includes('KUKATPALLY')
      ? pageConstituency.replace(/^(46)[- ]*/i, '46-')
      : pageConstituency || '46-KUKATPALLY',
    constituencyLabel: coverConstituency,
    parliamentaryConstituency:
      cleanStr(raw.parliamentary_constituency) || '7 - MALKAJGIRI (GEN)',
    district: cleanStr(raw.district) || 'MEDCHAL MALKAJGIRI',
    subdivision: cleanStr(raw.subdivision) || 'MALKAJGIRI',
    tehsilMandal: cleanStr(raw.tehsil_mandal) || 'KUKATPALLY',
    mainTown: cleanStr(raw.main_town_village) || 'GHMC, KUKATPALLY',
    postOffice: cleanStr(raw.post_office) || 'KUKATPALLY',
    policeStation: cleanStr(raw.police_station) || 'KUKATPALLY',
    pinCode: cleanStr(raw.pin_code).replace(/\D/g, '').slice(0, 6) || '500072',
    pollingStationName: cleanStr(raw.polling_station_name),
    pollingStationAddress: cleanStr(raw.polling_station_address),
    pollingStationType: cleanStr(raw.polling_station_type) || 'GENERAL',
    yearOfRevision: cleanStr(raw.year_of_revision) || '2026',
    qualifyingDate: cleanStr(raw.qualifying_date) || '01-10-2026',
    typeOfRevision:
      cleanStr(raw.type_of_revision) === '2026'
        ? 'Special Intensive Revision'
        : cleanStr(raw.type_of_revision) || 'Special Intensive Revision',
    dateOfPublication: cleanStr(raw.date_of_publication) || '17-08-2026',
    rollIdentification:
      cleanStr(raw.roll_identification) ||
      'Draft Electoral Roll of Special Intensive Revision, 2026',
    sectionsInPart: cleanStr(raw.sections_in_part),
    netMale: toNum(raw.net_male),
    netFemale: toNum(raw.net_female),
    netTotal: toNum(raw.net_total),
    section, // full header value e.g. "1-Dayarguda 5-6-1 To 5-6-34"
    sectionNo,
    sectionName,
    // Link key: Part + full Section header (unique across roll)
    sectionKey: `AC:${pageConstituency}|P:${part ?? 'x'}|S:${section || sectionNo || 'unknown'}`,
    sectionPath: `/parts/${part}/sections/${encodeURIComponent(section || sectionNo || 'unknown')}`,
    serial: toNum(raw.serial_no ?? raw.serial),
    serialRaw: cleanStr(raw.serial_no ?? raw.serial),
    epic: cleanStr(raw.epic_no ?? raw.epic).toUpperCase(),
    name: cleanStr(raw.name),
    relationType: cleanStr(raw.relation_type ?? raw.relationType),
    relationName: cleanStr(raw.relation_name ?? raw.relationName),
    house: cleanStr(raw.house_number ?? raw.house),
    age,
    ageBand: ageBand(age),
    gender,
    page: toNum(raw.page_no ?? raw.page) ?? 0,
    source,
  }
}

export async function loadVotersFromExcel(url = '/data/voters_all.xlsx') {
  // cache-bust so refreshed extracts are always picked up
  const sep = url.includes('?') ? '&' : '?'
  const res = await fetch(`${url}${sep}t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to load Excel: ${res.status}`)
  const buf = await res.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
  const normalized = rows.map(normalizeRow).filter((r) => r.epic || r.name)
  // Stable roll order: Part → S.No
  normalized.sort((a, b) => {
    const pa = a.part ?? 1e9
    const pb = b.part ?? 1e9
    if (pa !== pb) return pa - pb
    const sa = a.serial ?? 1e9
    const sb = b.serial ?? 1e9
    if (sa !== sb) return sa - sb
    return (a.page ?? 0) - (b.page ?? 0)
  })
  return normalized
}

function parseHouseRange(section) {
  const s = String(section || '')
  const m = s.match(/(\d[\w./-]*)\s+To\s+(\d[\w./-]*)/i)
  if (m) return `${m[1]} → ${m[2]}`
  return ''
}

function rollup(voters, keyFn, labelFn) {
  const map = new Map()
  for (const v of voters) {
    const key = keyFn(v)
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: labelFn(v),
        total: 0,
        male: 0,
        female: 0,
        avgAgeSum: 0,
        ageCount: 0,
        youth: 0,
        senior: 0,
        houses: new Set(),
        part: v.part,
        sectionNo: v.sectionNo,
        sectionName: v.sectionName,
        section: v.section,
        houseRange: parseHouseRange(v.section),
        source: v.source,
        district: v.district,
        subdivision: v.subdivision,
        tehsilMandal: v.tehsilMandal,
        pinCode: v.pinCode,
        pollingStationName: v.pollingStationName,
        parliamentaryConstituency: v.parliamentaryConstituency,
        constituency: v.constituency,
        netTotal: v.netTotal,
        netMale: v.netMale,
        netFemale: v.netFemale,
        qualifyingDate: v.qualifyingDate,
        dateOfPublication: v.dateOfPublication,
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
    if (v.house) row.houses.add(String(v.house).toLowerCase())
    if (!row.houseRange) row.houseRange = parseHouseRange(v.section)
    if (row.netTotal == null && v.netTotal != null) row.netTotal = v.netTotal
    if (row.netMale == null && v.netMale != null) row.netMale = v.netMale
    if (row.netFemale == null && v.netFemale != null) row.netFemale = v.netFemale
  }
  return [...map.values()]
    .map((r) => {
      const { houses, ...rest } = r
      return {
        ...rest,
        households: houses.size,
        avgAge: r.ageCount ? Math.round((r.avgAgeSum / r.ageCount) * 10) / 10 : 0,
        femaleShare: r.total ? Math.round((r.female / r.total) * 1000) / 10 : 0,
        youthPct: r.total ? Math.round((r.youth / r.total) * 1000) / 10 : 0,
      }
    })
    .sort((a, b) => {
      if (a.part !== b.part) return (a.part ?? 0) - (b.part ?? 0)
      return Number(a.sectionNo || 0) - Number(b.sectionNo || 0)
    })
}

export function computeStats(voters) {
  const total = voters.length
  const male = voters.filter((v) => v.gender === 'Male').length
  const female = voters.filter((v) => v.gender === 'Female').length
  const unknownGender = total - male - female
  const ages = voters.map((v) => v.age).filter((a) => a != null)
  const avgAge = ages.length
    ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10
    : 0

  const parts = rollup(
    voters,
    (v) => String(v.part ?? 0),
    (v) => `Part ${v.part ?? '—'}`,
  )

  const sections = rollup(
    voters,
    (v) => v.sectionKey,
    (v) => v.section || (v.sectionNo ? `${v.sectionNo}-${v.sectionName}` : 'Unmapped section'),
  )

  const bandOrder = ['18–25', '26–35', '36–45', '46–55', '56–65', '65+', 'Unknown']
  const bandCounts = Object.fromEntries(bandOrder.map((b) => [b, 0]))
  for (const v of voters) bandCounts[v.ageBand] = (bandCounts[v.ageBand] || 0) + 1
  const ageBandRows = bandOrder
    .filter((b) => bandCounts[b] > 0)
    .map((b) => ({ band: b, count: bandCounts[b] }))
  const ageMax = Math.max(1, ...ageBandRows.map((b) => b.count))
  const ageBands = ageBandRows.map((b) => ({
    ...b,
    pct: total ? Math.round((b.count / total) * 1000) / 10 : 0,
    bar: Math.round((b.count / ageMax) * 100),
  }))

  const youth = voters.filter((v) => v.age != null && v.age < 35).length
  const senior = voters.filter((v) => v.age != null && v.age >= 60).length

  const withSerial = voters.filter((v) => v.serial != null || (v.serialRaw && v.serialRaw !== '')).length
  const withEpic = voters.filter((v) => v.epic).length
  const withHouse = voters.filter((v) => v.house).length
  const withSection = voters.filter((v) => v.section && v.section !== 'Unmapped section').length
  const withAge = voters.filter((v) => v.age != null).length
  const withGender = voters.filter((v) => v.gender).length
  const withRelation = voters.filter((v) => v.relationType && v.relationName).length
  const coveragePct = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0)

  const sample = voters[0] || {}
  return {
    constituency: sample.constituency || '46-KUKATPALLY',
    constituencyLabel: sample.constituencyLabel || sample.constituency || '46-KUKATPALLY',
    parliamentaryConstituency: sample.parliamentaryConstituency || '7 - MALKAJGIRI (GEN)',
    district: sample.district || 'MEDCHAL MALKAJGIRI',
    subdivision: sample.subdivision || 'MALKAJGIRI',
    tehsilMandal: sample.tehsilMandal || 'KUKATPALLY',
    pinCode: sample.pinCode || '500072',
    qualifyingDate: sample.qualifyingDate || '01-10-2026',
    dateOfPublication: sample.dateOfPublication || '17-08-2026',
    typeOfRevision: sample.typeOfRevision || 'Special Intensive Revision',
    yearOfRevision: sample.yearOfRevision || '2026',
    total,
    male,
    female,
    unknownGender,
    avgAge,
    partsCount: parts.length,
    sectionsCount: sections.length,
    youth,
    senior,
    youthPct: total ? Math.round((youth / total) * 1000) / 10 : 0,
    femalePct: total ? Math.round((female / total) * 1000) / 10 : 0,
    serialCoverage: withSerial,
    serialCoveragePct: coveragePct(withSerial),
    fieldCoverage: [
      { field: 'S.No', count: withSerial, pct: coveragePct(withSerial) },
      { field: 'EPIC', count: withEpic, pct: coveragePct(withEpic) },
      { field: 'Section', count: withSection, pct: coveragePct(withSection) },
      { field: 'House', count: withHouse, pct: coveragePct(withHouse) },
      { field: 'Age', count: withAge, pct: coveragePct(withAge) },
      { field: 'Gender', count: withGender, pct: coveragePct(withGender) },
      { field: 'Relation', count: withRelation, pct: coveragePct(withRelation) },
    ],
    parts,
    sections,
    ageBands,
    pcs: optionCounts(voters, (v) => v.parliamentaryConstituency || '—'),
    pollingStations: optionCounts(voters, (v) => normalizeStationKey(v.pollingStationName)),
  }
}

/** Strip leading part index so "8 - School" and "9 - School" share one filter key. */
export function normalizeStationKey(name) {
  const raw = String(name || '').trim()
  if (!raw) return 'Unmapped station'
  return raw.replace(/^\d+\s*[-–]\s*/, '').replace(/\s+/g, ' ').trim() || 'Unmapped station'
}

function optionCounts(voters, keyFn) {
  const map = new Map()
  for (const v of voters) {
    const key = String(keyFn(v) || '').trim() || '—'
    map.set(key, (map.get(key) || 0) + 1)
  }
  return [...map.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
}

export function filterVoters(
  voters,
  {
    q = '',
    part = null,
    sectionNo = '',
    section = '',
    gender = '',
    ageBand = '',
    pcs = [],
    pollingStations = [],
  } = {},
) {
  const query = q.trim().toLowerCase()
  const pcSet = pcs?.length ? new Set(pcs) : null
  const psSet = pollingStations?.length ? new Set(pollingStations) : null
  return voters.filter((v) => {
    if (part != null && part !== '' && Number(v.part) !== Number(part)) return false
    // Prefer full section header match; fall back to section_no within a part
    if (section !== '') {
      if (String(v.section) !== String(section) && decodeURIComponent(String(section)) !== v.section) {
        return false
      }
    } else if (sectionNo !== '' && String(v.sectionNo) !== String(sectionNo)) {
      return false
    }
    if (gender && v.gender !== gender) return false
    if (ageBand && v.ageBand !== ageBand) return false
    if (pcSet && !pcSet.has(v.parliamentaryConstituency || '—')) return false
    if (psSet) {
      const norm = normalizeStationKey(v.pollingStationName)
      const raw = String(v.pollingStationName || '').trim()
      if (!psSet.has(norm) && !(raw && psSet.has(raw))) return false
    }
    if (!query) return true
    const stationNorm = normalizeStationKey(v.pollingStationName).toLowerCase()
    const serialHit =
      (v.serial != null && String(v.serial) === query) ||
      (v.serialRaw && v.serialRaw.toLowerCase().includes(query))
    return (
      serialHit ||
      v.name.toLowerCase().includes(query) ||
      v.epic.toLowerCase().includes(query) ||
      v.house.toLowerCase().includes(query) ||
      v.relationName.toLowerCase().includes(query) ||
      v.sectionName.toLowerCase().includes(query) ||
      v.section.toLowerCase().includes(query) ||
      v.constituency.toLowerCase().includes(query) ||
      (v.pollingStationName || '').toLowerCase().includes(query) ||
      stationNorm.includes(query) ||
      (v.parliamentaryConstituency || '').toLowerCase().includes(query)
    )
  })
}
