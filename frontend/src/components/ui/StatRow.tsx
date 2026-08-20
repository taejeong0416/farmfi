import type { ReactNode } from "react";

export type Stat = {
  label: string;
  value: ReactNode;
  unit?: string;
};

/** C-01 상단 지표 줄. 항목 사이를 세로선으로 나눈다. */
export function StatRow({ items }: { items: Stat[] }) {
  return (
    <div className="flex items-stretch border-y border-line-soft">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={`flex-1 py-5 ${i > 0 ? "border-l border-line-soft pl-8" : ""}`}
        >
          <p className="text-12 text-muted">{item.label}</p>
          <p className="mt-1 flex items-baseline gap-1">
            <span className="font-num text-22 font-medium text-ink">
              {item.value}
            </span>
            {item.unit ? (
              <span className="text-15 text-body">{item.unit}</span>
            ) : null}
          </p>
        </div>
      ))}
    </div>
  );
}

/** 라벨-값 한 줄. 상세 화면의 정보 목록에 쓴다. */
export function InfoRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-line-soft py-3 last:border-b-0">
      <span className="shrink-0 text-12 text-muted">{label}</span>
      <span className="text-right text-13 font-medium text-ink">{value}</span>
    </div>
  );
}
