// 운영자 앱 디자인 시스템 — Figma "0818ver_앱 UI_운영자용 앱" 기준.
//
// 이전 픽셀아트 팔레트(흙빛 #fffefa/#ded8cf)에서 밝은 카드 중심으로 개편됐다.
// Figma 캔버스가 402x874(1x)라 여기 값은 dp 와 1:1 이다 — 예전처럼 2로 나누지 않는다.
export const C = {
  // 브랜드
  green: "#1b5e3f",
  greenSoft: "#eef4ea",
  greenDark: "#164b2f",

  // 텍스트
  ink: "#1d1e1c",       // 본문·제목
  label: "#333333",     // 지표 라벨
  muted: "#656563",     // 보조 설명
  faint: "#656863",     // 시각 등 최약
  tabOff: "#a5a89f",    // 비활성 탭
  placeholder: "#a5a89f",

  // 면·선
  paper: "#ffffff",
  line: "#c9cec9",      // 카드 테두리
  divider: "#f1f1f1",   // 하단 네비 상단선
  stageBg: "#ffffff",

  // 상태
  danger: "#a33a2a",
  dangerSoft: "#fbf0ee",
  warn: "#a8762a",
  warnSoft: "#fdf6ea",
  info: "#2f6b86",
  infoSoft: "#eef5f8",
} as const;

// 앱 프레임 최대 폭. Figma 402 기준.
export const FRAME_MAX_WIDTH = 402;

// ── 타이포 ──
// 디자인은 Pretendard 를 쓴다. ttf 를 번들하기 전까지는 시스템 폰트로 떨어뜨리되,
// 굵기 토큰을 여기 모아 둬서 폰트가 들어오면 이 파일만 고치면 되게 한다.
// (iOS Apple SD Gothic Neo / Android Noto Sans KR 이 Pretendard 와 가장 가깝다)
export const F = {
  regular: undefined as string | undefined,
  semibold: undefined as string | undefined,
  bold: undefined as string | undefined,
} as const;

export const W = {
  regular: "400",
  semibold: "600",
  bold: "700",
} as const;

// 디자인에서 반복되는 글자 크기
export const T = {
  title: 18,      // 사용자 이름
  section: 16,    // 섹션 제목 · 카드 제목
  body: 15,       // 본문
  label: 14,      // 지표 라벨 · 카드 본문
  sub: 13,        // 보조 설명
  badge: 12,      // 배지 · 탭 라벨
  caption: 11,    // 시각 등
  metric: 20,     // 지표 숫자
} as const;

// 여백·모서리
export const S = {
  screenPad: 16,
  sectionGap: 24,
  itemGap: 12,
  cardPad: 16,
  radiusCard: 10,
  radiusBadge: 5,
  radiusChip: 6,
  radiusPill: 99,
  radiusCheckbox: 4,
  border: 1,
} as const;

// 알림·제어 결과에서 공통으로 쓰는 심각도 축
export type Severity = "critical" | "warning" | "normal";

export const SEVERITY: Record<Severity, { label: string; fg: string; bg: string }> = {
  critical: { label: "위험", fg: C.danger, bg: C.dangerSoft },
  warning: { label: "주의", fg: C.warn, bg: C.warnSoft },
  normal: { label: "정상", fg: C.green, bg: C.greenSoft },
};
