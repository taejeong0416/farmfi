// MobileFarmApp 픽셀 이식 — 색·크기 팔레트 (원본 CSS 변수 대응)
export const C = {
  green: "#1e603d",
  greenDark: "#164b2f",
  greenSoft: "#eef4ea",
  ink: "#1d1e1c",
  muted: "#656863",
  line: "#ded8cf",
  paper: "#fffefa",
  stageBg: "#efefed",
  cardLine: "#d9d1c5",

  // ── 상태 색 (설비 알림 심각도 / 재고 부족 / 제어 실패) ──
  // 기존 green 계열과 채도를 맞춰 흙빛 팔레트에 얹히도록 톤 다운함.
  danger: "#a33a2a",
  dangerSoft: "#fbf0ee",
  warn: "#a8762a",
  warnSoft: "#fdf6ea",
  info: "#2f6b86",
  infoSoft: "#eef5f8",
} as const;

// 앱 프레임 최대 폭 (원본: min(100%, 430px))
export const FRAME_MAX_WIDTH = 430;

// 알림·제어 결과에서 공통으로 쓰는 심각도 축
export type Severity = "critical" | "warning" | "normal";

export const SEVERITY: Record<Severity, { label: string; fg: string; bg: string }> = {
  critical: { label: "위험", fg: C.danger, bg: C.dangerSoft },
  warning: { label: "주의", fg: C.warn, bg: C.warnSoft },
  normal: { label: "정상", fg: C.green, bg: C.greenSoft },
};
