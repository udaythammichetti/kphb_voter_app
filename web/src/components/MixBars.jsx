/** Compact labeled horizontal mix bars for dashboard. */
export default function MixBars({
  items,
  valueKey = 'count',
  labelKey = 'band',
  accent = 'teal',
  onItemClick,
  labelWidth = null,
}) {
  const max = Math.max(1, ...items.map((i) => Number(i[valueKey]) || 0))
  const total = items.reduce((s, i) => s + (Number(i[valueKey]) || 0), 0) || 1

  return (
    <div
      className={`mix-bars accent-${accent}${onItemClick ? ' is-clickable' : ''}`}
      style={labelWidth ? { '--mix-label-w': labelWidth } : undefined}
    >
      {items.map((item) => {
        const value = Number(item[valueKey]) || 0
        const pctOfTotal =
          item.pct != null ? item.pct : Math.round((value / total) * 1000) / 10
        const width = Math.max(4, Math.round((value / max) * 100))
        const label = item[labelKey]
        const RowTag = onItemClick ? 'button' : 'div'
        return (
          <RowTag
            type={onItemClick ? 'button' : undefined}
            className="mix-row"
            key={label}
            onClick={onItemClick ? () => onItemClick(item) : undefined}
          >
            <span className="mix-label">{label}</span>
            <div className="mix-track" title={`${value.toLocaleString()} (${pctOfTotal}%)`}>
              <div className="mix-fill" style={{ width: `${width}%` }} />
            </div>
            <span className="mix-val">
              <strong>{value.toLocaleString()}</strong>
              <em>{pctOfTotal}%</em>
            </span>
          </RowTag>
        )
      })}
    </div>
  )
}
