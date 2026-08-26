// 앱 디자인 토큰 — 웹(`frontend/tailwind.config.ts`)과 같은 팔레트를 쓴다.
// Figma 앱 원본은 초록이 #1B5E3F, 웹은 #14542E로 서로 달랐다. 웹 값으로 맞춘다.
// 치환 근거는 `docs/figma-color-map.md`. 여기 없는 hex를 화면 코드에 직접 적지 않는다.

export const C = {
  ink: "#1A1A1A",
  body: "#4A4A4A",
  muted: "#8A8A8A",
  line: "#E5E5E3",
  lineSoft: "#EDEDEB",
  surface: "#F2F2F0",
  brand: "#14542E",
  brandSoft: "#EAF6EE",
  danger: "#A34A3D",
  dangerSoft: "#FBF0EE",
  warn: "#A8762A",
  warnSoft: "#FDF6EA",
  paper: "#FFFFFF",

  // 기존 픽셀아트 화면이 쓰는 이름. 값은 위 팔레트를 가리킨다.
  green: "#14542E",
  greenDark: "#0F3D21",
  greenSoft: "#EAF6EE",
  stageBg: "#F2F2F0",
} as const;

// 등급마다 배경과 글자색이 한 쌍으로 움직인다 (`App_Badge` · `App_SensorTile` 심볼).
// 배지와 센서 타일이 같은 표를 보므로 한 화면에서 "주의인데 배지는 회색" 같은
// 어긋남이 생기지 않는다.
export const SEVERITY = {
  critical: { bg: C.dangerSoft, fg: C.danger, label: "위험" },
  warning: { bg: C.warnSoft, fg: C.warn, label: "주의" },
  normal: { bg: C.brandSoft, fg: C.brand, label: "정상" },
} as const;

export type Severity = keyof typeof SEVERITY;

// Figma 앱 프레임 402 · 좌우 여백 16 · 콘텐츠 370
export const FRAME_MAX_WIDTH = 402;
export const GUTTER = 16;
export const CONTENT_WIDTH = FRAME_MAX_WIDTH - GUTTER * 2;

export const FS = {
  xs: 11,
  sm: 12,
  cap: 13,
  body: 14,
  md: 15,
  lg: 16,
  xl: 18,
  h2: 20,
  h1: 22,
  hero: 24,
} as const;

// Figma는 Regular / SemiBold / Bold 세 굵기만 쓴다.
export const FW = {
  regular: "400",
  semibold: "600",
  bold: "700",
} as const;

export const R = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  pill: 999,
} as const;

export const SP = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;
