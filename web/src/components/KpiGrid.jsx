export default function KpiGrid({ items }) {
  return (
    <div className="kpi-grid">
      {items.map((item) => (
        <article key={item.label} className="kpi" onClick={item.onClick} role={item.onClick ? 'button' : undefined}>
          <p className="kpi-label">{item.label}</p>
          <p className="kpi-value">{item.value}</p>
          {item.hint ? <p className="kpi-hint">{item.hint}</p> : null}
        </article>
      ))}
    </div>
  )
}
