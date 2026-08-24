import Link from "next/link";

export type Step = {
  label: string;
  /** done 완료 · current 진행 중 · todo 남음 */
  state: "done" | "current" | "todo";
  /** 주면 눌러서 그 단계로 돌아갈 수 있다. 끝낸 단계에만 준다. */
  href?: string;
};

/** 여러 화면에 걸친 절차의 현재 위치. 색 대신 글자와 굵기로 구분한다. */
export function StepLine({ steps }: { steps: Step[] }) {
  return (
    // 단계가 다섯이면 390 화면에서 한 줄에 들어가지 않는다. 접어서 두 줄로 보여준다 —
    // 가로로 굴리면 현재 단계가 화면 밖에 있을 수 있다.
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((s, i) => {
        const chip = (
          <span
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-12 ${
              s.state === "current"
                ? "border-brand bg-brand-soft font-medium text-brand"
                : s.state === "done"
                  ? "border-line bg-white text-body"
                  : "border-line bg-white text-muted"
            } ${s.href ? "hover:bg-surface" : ""}`}
          >
            <span className="font-num text-11">
              {s.state === "done" ? "✓" : i + 1}
            </span>
            {s.label}
          </span>
        );
        return (
          <li key={s.label} className="flex items-center gap-2">
            {s.href ? <Link href={s.href}>{chip}</Link> : chip}
            {i < steps.length - 1 ? (
              <span className="h-px w-4 bg-line" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** 세로 진행 목록. 마일스톤·개점 준비 현황처럼 항목마다 설명이 붙는 곳에 쓴다. */
export function StepList({
  items,
}: {
  items: { title: string; desc?: string; state: Step["state"]; right?: React.ReactNode }[];
}) {
  return (
    <ol>
      {items.map((s) => (
        <li
          key={s.title}
          className="flex items-start gap-3 border-b border-line-soft py-4 last:border-b-0"
        >
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-11 ${
              s.state === "done"
                ? "border-brand bg-brand text-white"
                : s.state === "current"
                  ? "border-brand bg-white text-brand"
                  : "border-line bg-white text-muted"
            }`}
          >
            {s.state === "done" ? "✓" : "·"}
          </span>
          <span className="flex-1">
            <span className="block text-14 font-medium text-ink">{s.title}</span>
            {s.desc ? (
              <span className="mt-1 block text-12 text-muted">{s.desc}</span>
            ) : null}
          </span>
          {s.right}
        </li>
      ))}
    </ol>
  );
}
