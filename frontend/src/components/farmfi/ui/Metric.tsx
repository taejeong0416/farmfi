export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="card metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <p className="muted">▲ 12.4% 전월 대비</p>
    </article>
  );
}
