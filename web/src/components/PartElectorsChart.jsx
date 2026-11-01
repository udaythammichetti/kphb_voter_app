import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from 'recharts'
import { useNavigate } from 'react-router-dom'
import { buildBoothRollup } from '../lib/booths'
import { useVoterData } from '../context/VoterData'

const COLORS = [
  '#2ed3a0',
  '#3db892',
  '#e8b45c',
  '#f0c878',
  '#5eb0e0',
  '#7ec8ef',
  '#d4894a',
  '#68c49a',
  '#c97b3a',
  '#9fe0c8',
]

const RADIAN = Math.PI / 180

function ActiveShape(props) {
  const { cx, cy, outerRadius, startAngle, endAngle, fill } = props
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={0}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke="#0b1410"
        strokeWidth={2}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + 12}
        outerRadius={outerRadius + 16}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.5}
      />
    </g>
  )
}

function sliceLabel({ cx, cy, midAngle, outerRadius, percent, index }) {
  if (percent < 0.06) return null
  const r = outerRadius * 0.58
  const x = cx + r * Math.cos(-midAngle * RADIAN)
  const y = cy + r * Math.sin(-midAngle * RADIAN)
  return (
    <text
      x={x}
      y={y}
      fill="#0c1612"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: 11, fontWeight: 800, pointerEvents: 'none' }}
    >
      {index + 1}
    </text>
  )
}

function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="pie-tooltip">
      <strong>{d.name}</strong>
      <span>
        {d.total.toLocaleString()} electors · {d.pct}%
      </span>
      <span className="pie-tooltip-sub">
        Parts {d.partsLabel} · M {d.male} · F {d.female}
        {d.femaleShare != null ? ` · ${d.femaleShare}% F` : ''}
      </span>
      <span className="pie-tooltip-hint">Click to open</span>
    </div>
  )
}

export default function PartElectorsChart({ voters = [], total = 0 }) {
  const navigate = useNavigate()
  const {
    setPollingStations,
    setPart,
    setSectionNo,
    setQ,
    setGender,
    setAgeBand,
    setPcs,
  } = useVoterData()
  const [activeIndex, setActiveIndex] = useState(null)

  const booths = useMemo(() => buildBoothRollup(voters), [voters])

  const data = useMemo(
    () =>
      booths.map((b, i) => ({
        ...b,
        id: i + 1,
        pct: total ? Math.round((b.total / total) * 1000) / 10 : 0,
      })),
    [booths, total],
  )

  const max = useMemo(() => Math.max(1, ...data.map((d) => d.total)), [data])
  const top = data[0] || null
  const active = activeIndex != null ? data[activeIndex] : null

  const openBooth = (d) => {
    if (!d) return
    // Apply station filter with normalized key; clear other filters so results match the pie
    setQ('')
    setSectionNo('')
    setGender('')
    setAgeBand('')
    setPcs([])
    setPart('')
    setPollingStations([d.name])
    navigate('/voters')
  }

  if (!data.length) return <p className="muted">No polling station data.</p>

  return (
    <div className="pie-wrap">
      <div className="pie-stats">
        <span className="pie-stat">
          <em>Total</em>
          <strong>{total.toLocaleString()}</strong>
        </span>
        <span className="pie-stat">
          <em>Stations</em>
          <strong>{data.length}</strong>
        </span>
        {top ? (
          <span className="pie-stat is-accent">
            <em>Largest</em>
            <strong>
              #{top.id} · {top.pct}%
            </strong>
          </span>
        ) : null}
        {active ? (
          <span className="pie-stat is-live">
            <em>Hover</em>
            <strong>
              #{active.id} · {active.total.toLocaleString()}
            </strong>
          </span>
        ) : null}
      </div>

      <div className="pie-layout">
        <div className="pie-canvas">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="total"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={0}
                outerRadius="84%"
                paddingAngle={1.2}
                stroke="#0b1410"
                strokeWidth={2}
                label={sliceLabel}
                labelLine={false}
                activeShape={ActiveShape}
                onMouseEnter={(_, i) => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
                onClick={(d) => openBooth(d)}
                style={{ cursor: 'pointer', outline: 'none' }}
              >
                {data.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={COLORS[i % COLORS.length]}
                    opacity={activeIndex == null || activeIndex === i ? 1 : 0.4}
                    style={{
                      filter:
                        activeIndex === i
                          ? 'drop-shadow(0 0 14px rgba(46, 211, 160, 0.55))'
                          : 'none',
                      transition: 'opacity 0.15s ease',
                    }}
                  />
                ))}
              </Pie>
              <Tooltip
                content={<PieTooltip />}
                active={activeIndex != null}
                defaultIndex={activeIndex ?? undefined}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <ul className="pie-legend">
          {data.map((d, i) => {
            const isActive = activeIndex === i
            const bar = Math.round((d.total / max) * 100)
            return (
              <li key={d.name}>
                <button
                  type="button"
                  className={`pie-legend-btn${isActive ? ' is-active' : ''}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex(null)}
                  onFocus={() => setActiveIndex(i)}
                  onBlur={() => setActiveIndex(null)}
                  onClick={() => openBooth(d)}
                  title={d.name}
                >
                  <span className="pie-swatch" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="pie-legend-main">
                    <span className="pie-legend-top">
                      <span className="pie-legend-name">
                        <span className="pie-booth-id">#{d.id}</span> {d.short}
                      </span>
                      {i < 3 ? <span className="pie-rank">#{i + 1}</span> : null}
                    </span>
                    <span className="pie-legend-meta muted">{d.partsLabel}</span>
                    <span className="pie-mini-track">
                      <span
                        className="pie-mini-fill"
                        style={{ width: `${bar}%`, background: COLORS[i % COLORS.length] }}
                      />
                    </span>
                  </span>
                  <span className="pie-legend-val">
                    <strong>{d.total.toLocaleString()}</strong>
                    <em>{d.pct}%</em>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      <p className="pie-hint muted">
        Grouped by polling station (shared stations merged) · click to open
      </p>
    </div>
  )
}
