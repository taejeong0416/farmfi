import type { ReactNode } from "react";

export type Stat = {
  label: string;
  value: ReactNode;
  unit?: string;
};

/** C-01 상단 지표 줄. 항목 사이를 세로선으로 나눈다. */
export function StatRow({ items }: { items: Stat[] }) {
  return (
    // 좁은 화면에서는 한 줄에 다 넣지 않고 두 칸씩 접는다. 다섯 칸을 390에 밀어
    // 넣으면 숫자가 줄바꿈되거나 잘려 지표를 못 읽는다.
    <div className="flex flex-wrap items-stretch border-y border-line-soft">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={`min-w-0 basis-1/2 py-5 sm:flex-1 sm:basis-0 ${
            i > 0 ? "sm:border-l sm:border-line-soft sm:pl-8" : ""
          }`}
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
