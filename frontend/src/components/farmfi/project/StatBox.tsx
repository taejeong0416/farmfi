// Minimal stat card — deliberately NOT the shared `Metric` component.
// `Metric` (ui/Metric.tsx) hardcodes a "▲ 12.4% 전월 대비" caption on every
// card, which would misrepresent real investor-facing figures (escrow
// balances, funding totals) shown on this page. This variant renders only
// label + value, reusing the same `.card.metric` box styling.

export function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <article className="card metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
