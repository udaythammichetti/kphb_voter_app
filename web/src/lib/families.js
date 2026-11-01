/** Build household / family hierarchy from electoral-roll rows. */

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\b(late|smt|smts|shri|sri|mr|mrs|ms)\b\.?/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(s) {
  return normName(s)
    .split(' ')
    .filter((t) => t.length > 1 || /^[a-z]$/.test(t))
}

function compact(s) {
  return normName(s).replace(/\s+/g, '')
}

function editDistance(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, prevDiag + cost)
      prevDiag = temp
    }
  }
  return prev[b.length]
}

function tokensClose(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true
  const maxLen = Math.max(a.length, b.length)
  if (maxLen < 4) return false
  const dist = editDistance(a, b)
  if (maxLen >= 8) return dist <= 2
  return dist <= 1
}

/** Score how well relation_name matches a household member name (0 = no match). */
export function nameMatchScore(relationName, memberName) {
  const ra = normName(relationName)
  const rb = normName(memberName)
  if (!ra || !rb) return 0
  if (ra === rb) return 100
  if (compact(ra) === compact(rb)) return 98

  const ta = tokens(relationName)
  const tb = tokens(memberName)
  if (!ta.length || !tb.length) return 0

  // containment of full normalized string
  if (ra.includes(rb) || rb.includes(ra)) return 90

  const setB = new Set(tb)
  const setA = new Set(ta)
  const overlap = ta.filter((t) => setB.has(t) || [...setB].some((u) => tokensClose(t, u))).length
  const lastA = ta[ta.length - 1]
  const lastB = tb[tb.length - 1]
  const firstA = ta[0]
  const firstB = tb[0]
  const surnameClose = tokensClose(lastA, lastB)
  const firstClose = tokensClose(firstA, firstB) || firstA[0] === firstB[0]

  // surname match + first name / initial
  if (surnameClose && lastA.length > 2) {
    const firstHit = firstA === firstB || tokensClose(firstA, firstB)
    if (firstHit) {
      // Long names with same first+last but different middles are weak (OCR family prefixes)
      if (ta.length >= 3 && tb.length >= 3) {
        const midA = ta.slice(1, -1)
        const midB = tb.slice(1, -1)
        const midHit = midA.some((t) => midB.some((u) => tokensClose(t, u)))
        if (!midHit) return 55
      }
      return lastA === lastB ? 88 : 84
    }
    // Initial-only support when one side uses a single-letter given name
    if ((firstA.length === 1 || firstB.length === 1) && firstA[0] === firstB[0]) {
      return 82
    }
    if (overlap >= 2) return 78
    // shared/near surname only — weak, still usable when unique in house
    return 55
  }

  // Initial + surname style: "V Ashoka" vs "Ashoka" / "Venu Ashoka"
  if (ta.length >= 2 && ta[0].length === 1 && (tb.includes(lastA) || [...tb].some((u) => tokensClose(lastA, u)))) {
    const restOverlap = ta.slice(1).filter((t) => setB.has(t) || [...setB].some((u) => tokensClose(t, u))).length
    if (restOverlap) return 80
  }
  if (tb.length >= 2 && tb[0].length === 1 && (ta.includes(lastB) || [...ta].some((u) => tokensClose(lastB, u)))) {
    const restOverlap = tb.slice(1).filter((t) => setA.has(t) || [...setA].some((u) => tokensClose(t, u))).length
    if (restOverlap) return 80
  }

  // reversed token order
  if (ta.length >= 2 && tb.length >= 2 && tokensClose(ta[0], lastB) && tokensClose(lastA, firstB)) return 85

  if (overlap >= Math.min(2, Math.min(ta.length, tb.length)) && (surnameClose || firstClose)) {
    return 70 + overlap
  }

  // single distinctive token shared (length >= 5) when one side is short
  const longShared = ta.filter((t) => t.length >= 5 && ([...setB].some((u) => tokensClose(t, u))))
  if (longShared.length && (ta.length <= 2 || tb.length <= 2)) return 62

  return 0
}

export function namesMatch(a, b) {
  return nameMatchScore(a, b) >= 62
}

export function houseKey(part, house) {
  const h = String(house || '')
    .toLowerCase()
    .replace(/\s+/g, '')
  return `p${part ?? 'x'}|h${h || 'unknown'}`
}

/** Parent/child edge is impossible when the "child" is older/same age as claimed parent. */
function ageSaneParentChild(child, parent) {
  if (child?.age == null || parent?.age == null) return true
  return child.age < parent.age
}

function findBestMatch(relationName, members, selfEpic, relationType) {
  const self = members.find((m) => m.epic === selfEpic)
  const scored = []
  for (const o of members) {
    if (o.epic === selfEpic) continue
    let score = nameMatchScore(relationName, o.name)
    if (score < 55) continue
    if (relationType === 'Father' || relationType === 'Husband') {
      if (o.gender === 'Male') score += 8
      else if (o.gender === 'Female') score -= 12
    } else if (relationType === 'Mother') {
      if (o.gender === 'Female') score += 8
      else if (o.gender === 'Male') score -= 12
    }
    // Prefer older for Father/Mother; reject age-inverted candidates
    if (relationType === 'Father' || relationType === 'Mother') {
      if (!ageSaneParentChild(self, o)) continue
      const gap = (o.age ?? 0) - (self?.age ?? 0)
      if (gap >= 14) score += 6
      else if (gap >= 8) score += 3
      else score += Math.min(2, (o.age ?? 0) / 40)
    }
    scored.push({ member: o, score })
  }
  if (!scored.length) return null
  scored.sort((a, b) => b.score - a.score)
  // Surname-only matches must be unique enough
  if (scored[0].score < 62) {
    const near = scored.filter((s) => s.score >= 55)
    if (near.length !== 1) return null
  }
  // Ambiguous top scores → skip
  if (scored.length > 1 && scored[0].score - scored[1].score < 3 && scored[0].score < 85) {
    return null
  }
  return scored[0].member
}

/** Return cycle path of epics (child→…→child) or null. */
function findCycle(parentOf) {
  const state = new Map() // 0=unseen,1=stack,2=done
  const stack = []

  function dfs(epic) {
    state.set(epic, 1)
    stack.push(epic)
    const parent = parentOf.get(epic)
    if (parent) {
      const st = state.get(parent) || 0
      if (st === 1) {
        const idx = stack.indexOf(parent)
        return stack.slice(idx)
      }
      if (st === 0) {
        const cycle = dfs(parent)
        if (cycle) return cycle
      }
    }
    stack.pop()
    state.set(epic, 2)
    return null
  }

  for (const epic of parentOf.keys()) {
    if ((state.get(epic) || 0) === 0) {
      const cycle = dfs(epic)
      if (cycle?.length) return cycle
    }
  }
  return null
}

/** Break mutual loops and longer cycles so the tree stays a DAG. */
function resolveParentCycles(parentOf, byEpic) {
  // Mutual A↔B: keep Husband→wife edge, else keep older as parent
  for (const [childEpic, parentEpic] of [...parentOf.entries()]) {
    const child = byEpic.get(childEpic)
    const parent = byEpic.get(parentEpic)
    if (!child || !parent) {
      parentOf.delete(childEpic)
      continue
    }
    if (parentOf.get(parentEpic) === childEpic) {
      const childIsWife = child.relationType === 'Husband'
      if (childIsWife) parentOf.delete(parentEpic)
      else if ((parent.age ?? 0) >= (child.age ?? 0)) parentOf.delete(parentEpic)
      else parentOf.delete(childEpic)
    }
  }

  // Longer cycles: drop the weakest edge (age-inverted Father/Mother, else youngest parent)
  for (let guard = 0; guard <= parentOf.size + 1; guard++) {
    const cycle = findCycle(parentOf)
    if (!cycle?.length) break

    let drop = null
    for (const childEpic of cycle) {
      const child = byEpic.get(childEpic)
      const parent = byEpic.get(parentOf.get(childEpic))
      if (!child || !parent) continue
      if (
        (child.relationType === 'Father' || child.relationType === 'Mother') &&
        !ageSaneParentChild(child, parent)
      ) {
        drop = childEpic
        break
      }
    }
    if (drop == null) {
      let youngest = Infinity
      for (const childEpic of cycle) {
        const parent = byEpic.get(parentOf.get(childEpic))
        const age = parent?.age ?? 999
        if (age < youngest) {
          youngest = age
          drop = childEpic
        }
      }
    }
    parentOf.delete(drop || cycle[0])
  }
}

function pickHead(members, parentOf) {
  const score = new Map(members.map((m) => [m.epic, 0]))
  for (const m of members) {
    const childCount = [...parentOf.values()].filter((p) => p === m.epic).length
    score.set(m.epic, (score.get(m.epic) || 0) + childCount * 4)
  }
  for (const m of members) {
    for (const other of members) {
      if (other.epic === m.epic) continue
      if (!other.relationName) continue
      if (nameMatchScore(other.relationName, m.name) < 62) continue
      if (other.relationType === 'Father' || other.relationType === 'Husband') {
        score.set(m.epic, (score.get(m.epic) || 0) + 3)
      } else if (other.relationType === 'Mother') {
        score.set(m.epic, (score.get(m.epic) || 0) + 2)
      }
    }
  }
  const ranked = [...members].sort((a, b) => {
    const ds = (score.get(b.epic) || 0) - (score.get(a.epic) || 0)
    if (ds) return ds
    const ageA = a.age ?? -1
    const ageB = b.age ?? -1
    if (ageB !== ageA) return ageB - ageA
    return String(a.name).localeCompare(String(b.name))
  })
  return ranked[0]
}

function roleLabel(member, head, parent) {
  if (head && member.epic === head.epic) return 'Head'
  if (parent) {
    if (member.relationType === 'Husband' && namesMatch(parent.name, member.relationName)) return 'Spouse'
    if (member.relationType === 'Father' && namesMatch(parent.name, member.relationName)) return 'Child'
    if (member.relationType === 'Mother' && namesMatch(parent.name, member.relationName)) return 'Child'
  }
  if (member.relationType === 'Husband') return 'Spouse'
  if (member.relationType === 'Father' || member.relationType === 'Mother') return 'Child'
  return member.relationType || 'Member'
}

/**
 * Link members inside one household into a tree using relation_type + relation_name.
 * Same-house electors with no resolvable name match are returned as unlinked.
 */
export function buildFamilyTree(members) {
  if (!members.length) {
    return { head: null, roots: [], unlinked: [], nodes: [], linkedCount: 0, unlinkedCount: 0 }
  }

  const byEpic = new Map(members.map((m) => [m.epic, { ...m, children: [], linked: false }]))
  const parentOf = new Map()

  for (const m of members) {
    if (!m.relationName || !m.relationType) continue
    const match = findBestMatch(m.relationName, members, m.epic, m.relationType)
    if (!match) continue
    // Final age gate for parent/child edges (Husband may be younger than wife)
    if (
      (m.relationType === 'Father' || m.relationType === 'Mother') &&
      !ageSaneParentChild(m, match)
    ) {
      continue
    }
    parentOf.set(m.epic, match.epic)
  }

  resolveParentCycles(parentOf, byEpic)

  const head = pickHead(members, parentOf)
  if (head && parentOf.has(head.epic)) parentOf.delete(head.epic)

  for (const [childEpic, parentEpic] of parentOf.entries()) {
    byEpic.get(parentEpic).children.push(byEpic.get(childEpic))
    byEpic.get(childEpic).linked = true
    byEpic.get(parentEpic).linked = true
  }

  const linkedEpics = new Set()
  for (const [c, p] of parentOf.entries()) {
    linkedEpics.add(c)
    linkedEpics.add(p)
  }

  const childSet = new Set(parentOf.keys())
  const treeRoots = members
    .filter((m) => linkedEpics.has(m.epic) && !childSet.has(m.epic))
    .map((m) => byEpic.get(m.epic))

  // Ensure head appears first among tree roots when linked
  let roots = treeRoots
  if (head && linkedEpics.has(head.epic)) {
    roots = roots.sort((a, b) => (a.epic === head.epic ? -1 : b.epic === head.epic ? 1 : 0))
    if (!roots.find((r) => r.epic === head.epic)) roots.unshift(byEpic.get(head.epic))
  }

  function annotate(node, parent = null, depth = 0) {
    node.depth = depth
    node.role = roleLabel(node, head, parent)
    node.linked = true
    node.children = (node.children || []).map((c) => annotate(c, node, depth + 1))
    return node
  }
  roots = roots.map((r) => annotate(r, null, 0))

  // Same house, no relation edge resolved → Unlinked
  const unlinked = members
    .filter((m) => !linkedEpics.has(m.epic))
    .map((m) => {
      const node = byEpic.get(m.epic)
      node.depth = 0
      node.role = members.length === 1 ? 'Sole elector' : 'Unlinked'
      node.linked = false
      node.children = []
      return node
    })
    .sort((a, b) => (b.age ?? 0) - (a.age ?? 0) || String(a.name).localeCompare(String(b.name)))

  // Single-member house: treat as sole, not "unlinked" problem
  const unlinkedCount = members.length === 1 ? 0 : unlinked.length

  return {
    head: head || members[0],
    roots,
    unlinked: members.length === 1 ? [] : unlinked,
    nodes: members,
    linkedCount: parentOf.size,
    unlinkedCount,
    linkedMemberCount: linkedEpics.size,
  }
}

export function buildFamilies(voters) {
  const groups = new Map()
  for (const v of voters) {
    if (!v.house) continue
    const key = houseKey(v.part, v.house)
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        part: v.part,
        house: v.house,
        sectionNo: v.sectionNo,
        sectionName: v.sectionName,
        section: v.section,
        pollingStationName: v.pollingStationName,
        members: [],
      })
    }
    groups.get(key).members.push(v)
  }

  const families = []
  for (const g of groups.values()) {
    const tree = buildFamilyTree(g.members)
    const male = g.members.filter((m) => m.gender === 'Male').length
    const female = g.members.filter((m) => m.gender === 'Female').length
    const ages = g.members.map((m) => m.age).filter((a) => a != null)
    families.push({
      ...g,
      size: g.members.length,
      male,
      female,
      avgAge: ages.length
        ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10
        : 0,
      headName: tree.head?.name || g.members[0]?.name || '—',
      headEpic: tree.head?.epic || '',
      headAge: tree.head?.age ?? null,
      linkedCount: tree.linkedCount,
      unlinkedCount: tree.unlinkedCount,
      linkedMemberCount: tree.linkedMemberCount,
      tree,
      surnameHint: guessSurname(g.members),
    })
  }

  families.sort((a, b) => b.size - a.size || (a.part ?? 0) - (b.part ?? 0))
  return families
}

function guessSurname(members) {
  const counts = new Map()
  for (const m of members) {
    const t = tokens(m.name)
    if (t.length < 2) continue
    const last = t[t.length - 1]
    if (last.length < 3) continue
    counts.set(last, (counts.get(last) || 0) + 1)
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return best && best[1] >= 2 ? best[0] : ''
}

export function familyStats(families, voterTotal) {
  const households = families.length
  const multi = families.filter((f) => f.size >= 2).length
  const singles = families.filter((f) => f.size === 1).length
  const large = families.filter((f) => f.size >= 5).length
  const avgSize = households
    ? Math.round((families.reduce((s, f) => s + f.size, 0) / households) * 10) / 10
    : 0
  const withUnlinked = families.filter((f) => f.unlinkedCount > 0).length
  const totalUnlinked = families.reduce((s, f) => s + f.unlinkedCount, 0)
  const totalLinks = families.reduce((s, f) => s + f.linkedCount, 0)

  const sizeBandsRaw = [
    { band: '1 person', size: 1, count: families.filter((f) => f.size === 1).length },
    { band: '2', size: 2, count: families.filter((f) => f.size === 2).length },
    { band: '3–4', size: 3, count: families.filter((f) => f.size >= 3 && f.size <= 4).length },
    { band: '5–7', size: 5, count: families.filter((f) => f.size >= 5 && f.size <= 7).length },
    { band: '8+', size: 8, count: families.filter((f) => f.size >= 8).length },
  ]
  const sizeMax = Math.max(1, ...sizeBandsRaw.map((b) => b.count))
  const sizeBands = sizeBandsRaw.map((b) => ({
    ...b,
    pct: households ? Math.round((b.count / households) * 1000) / 10 : 0,
    bar: Math.round((b.count / sizeMax) * 100),
  }))

  const topFamilies = families.slice(0, 12)
  return {
    households,
    multi,
    singles,
    large,
    avgSize,
    withUnlinked,
    totalUnlinked,
    totalLinks,
    coveredVoters: families.reduce((s, f) => s + f.size, 0),
    uncoveredVoters: Math.max(0, voterTotal - families.reduce((s, f) => s + f.size, 0)),
    sizeBands,
    topFamilies,
  }
}

export function filterFamilies(
  families,
  { q = '', part = null, minSize = 0, onlyUnlinked = false } = {},
) {
  const query = q.trim().toLowerCase()
  return families.filter((f) => {
    if (part != null && part !== '' && Number(f.part) !== Number(part)) return false
    if (f.size < Number(minSize || 0)) return false
    if (onlyUnlinked && !(f.unlinkedCount > 0)) return false
    if (!query) return true
    return (
      f.house.toLowerCase().includes(query) ||
      f.headName.toLowerCase().includes(query) ||
      f.surnameHint.toLowerCase().includes(query) ||
      (f.pollingStationName || '').toLowerCase().includes(query) ||
      f.members.some(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.epic.toLowerCase().includes(query) ||
          m.relationName.toLowerCase().includes(query),
      )
    )
  })
}
