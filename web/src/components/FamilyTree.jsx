import { useState } from 'react'
import { useVoterData } from '../context/VoterData'

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function PersonCard({ node, variant = 'tree' }) {
  const { openVoter } = useVoterData()
  const unlinked = node.role === 'Unlinked' || node.linked === false
  const genderClass =
    node.gender === 'Female' ? 'is-female' : node.gender === 'Male' ? 'is-male' : ''

  const open = (e) => {
    e?.stopPropagation?.()
    openVoter(node)
  }

  return (
    <article
      className={`ft-person ${variant}${unlinked ? ' is-unlinked' : ''} ${genderClass}`}
    >
      <button type="button" className={`ft-avatar ${genderClass}`} onClick={open} aria-label={`Open ${node.name}`}>
        {initials(node.name)}
      </button>
      <div className="ft-body">
        <div className="ft-top">
          <span className={`ft-badge${unlinked ? ' is-warn' : ''}`}>{node.role}</span>
          {node.serial != null ? <span className="ft-sno">S.No {node.serial}</span> : null}
        </div>
        <button type="button" className="ft-name-btn" onClick={open}>
          <span className="ft-name">{node.name || '—'}</span>
        </button>
        <div className="ft-line">
          <button type="button" className="ft-epic-btn mono" onClick={open}>
            {node.epic || '—'}
          </button>
          <span className="ft-dot">·</span>
          <span>
            {node.age ?? '—'} yrs
          </span>
          <span className="ft-dot">·</span>
          <span>{node.gender || '—'}</span>
        </div>
        {node.relationType ? (
          <p className="ft-rel">
            {node.relationType}: {node.relationName || '—'}
            {unlinked && node.relationName ? <em> · not in this house</em> : null}
          </p>
        ) : null}
      </div>
    </article>
  )
}

/** Vertical pedigree with rail connectors */
function PedigreeNode({ node, isLast = true, depth = 0 }) {
  const kids = node.children || []
  return (
    <li className={`ft-ped-item${isLast ? ' is-last' : ''}${kids.length ? ' has-kids' : ''}`}>
      <div className="ft-ped-row">
        <PersonCard node={node} />
      </div>
      {kids.length ? (
        <ul className="ft-ped-kids">
          {kids.map((c, i) => (
            <PedigreeNode key={c.epic} node={c} isLast={i === kids.length - 1} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function PedigreeTree({ root }) {
  return (
    <div className="ft-pedigree">
      <ul className="ft-ped-root">
        <PedigreeNode node={root} isLast />
      </ul>
    </div>
  )
}

export default function FamilyTree({ family }) {
  const [mode, setMode] = useState('tree')
  if (!family) return null

  const { tree } = family
  const linkedRoots = tree.roots || []
  const unlinked = tree.unlinked || []

  return (
    <div className="family-tree">
      <div className="family-tree-meta">
        <div>
          <p>
            <strong>{family.size}</strong> electors · house <strong>{family.house}</strong>
            {family.surnameHint ? (
              <>
                {' '}
                · <em>{family.surnameHint}</em>
              </>
            ) : null}
          </p>
          <p className="muted">
            Head: {family.headName} · {family.linkedCount} links
            {family.unlinkedCount > 0 ? (
              <>
                {' '}
                · <span className="unlinked-tag">{family.unlinkedCount} unlinked</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="ft-mode-toggle" role="group" aria-label="Tree layout">
          <button type="button" className={mode === 'tree' ? 'is-active' : ''} onClick={() => setMode('tree')}>
            Tree
          </button>
          <button type="button" className={mode === 'list' ? 'is-active' : ''} onClick={() => setMode('list')}>
            Cards
          </button>
        </div>
      </div>

      {linkedRoots.length ? (
        <section className="family-section">
          {mode === 'tree' ? (
            <div className="ft-ped-canvas">
              {linkedRoots.map((root, idx) => (
                <div className="ft-ped-block" key={root.epic}>
                  {linkedRoots.length > 1 ? (
                    <p className="ft-ped-label">Branch {idx + 1}</p>
                  ) : null}
                  <PedigreeTree root={root} />
                </div>
              ))}
            </div>
          ) : (
            <div className="ft-card-grid">
              {linkedRoots.flatMap(function walk(n) {
                return [n, ...(n.children || []).flatMap(walk)]
              }).map((node) => (
                <PersonCard key={node.epic} node={node} variant="card" />
              ))}
            </div>
          )}
        </section>
      ) : (
        <p className="muted small">No relation name matches inside this house yet.</p>
      )}

      {unlinked.length ? (
        <section className="family-section unlinked-section">
          <h3 className="family-section-title">
            Unlinked in this house
            <span className="unlinked-tag">{unlinked.length}</span>
          </h3>
          <div className="ft-card-grid">
            {unlinked.map((node) => (
              <PersonCard key={node.epic} node={node} variant="card" />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
