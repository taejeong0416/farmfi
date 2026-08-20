export function ProgressBar({
  value,
  label,
  height = 5,
}: {
  /** 0~100 */
  value: number;
  label?: string;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div
        className="w-full overflow-hidden rounded-full bg-line-soft"
        style={{ height }}
      >
        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      {label ? (
        <p className="mt-2 text-13 font-medium text-brand">{label}</p>
      ) : null}
    </div>
  );
}
