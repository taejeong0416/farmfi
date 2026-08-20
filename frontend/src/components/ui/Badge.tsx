import type { ReactNode } from "react";

/**
 * 상태 배지. 색으로 등급을 매기지 않는다 — 통과/실패만 색을 쓰고 나머지는 글자로 말한다.
 * pass  통과·승인·완료   fail 실패·거부   solid 강조(모집 중 등)   plain 그 외 전부
 */
type Tone = "plain" | "pass" | "fail" | "solid";

const toneClass: Record<Tone, string> = {
  plain: "border-line bg-white text-muted",
  pass: "border-brand bg-brand-soft text-brand",
  fail: "border-danger bg-white text-danger",
  solid: "border-brand bg-brand text-white",
};

export function Badge({
  tone = "plain",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-[22px] items-center rounded-6 border px-2 text-11 font-medium ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}
