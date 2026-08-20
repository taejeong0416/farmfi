import type { ReactNode } from "react";

export function EmptyState({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-10 border border-line bg-white px-6 py-16 text-center">
      <p className="text-15 font-bold text-ink">{title}</p>
      {desc ? <p className="mt-2 text-13 text-muted">{desc}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/** 데이터를 기다리는 동안의 자리. 화면 구조를 미리 보여준다. */
export function SkeletonBlock({ height = 80 }: { height?: number }) {
  return (
    <div
      className="animate-pulse rounded-10 bg-surface"
      style={{ height }}
      aria-hidden
    />
  );
}

/** Figma의 `사진 자리`. 실제 이미지가 없을 때 자리를 지킨다. */
export function PhotoSlot({
  label = "대표 공간 사진",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center rounded-10 border border-line bg-surface text-11 text-muted ${className ?? ""}`}
    >
      {label}
    </div>
  );
}
