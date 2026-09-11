// 앱 디자인 토큰 — 웹(`frontend/tailwind.config.ts`)과 같은 팔레트를 쓴다.
// 앱 `.fig`와 웹 `.fig`가 갈리는 값은 웹을 따른다(초록 #1B5E3F→#14542E,
// 연초록 #EAF6EE→#F1F4F2). 같은 이름의 토큰이 두 값을 가지면 공유 팔레트가 아니다.
// `warn`은 웹에 대응 토큰이 없어 앱 `.fig` 값(#A8762A)을 그대로 쓴다.
// 여기 없는 hex를 화면 코드에 직접 적지 않는다.

export const C = {
  ink: "#1A1A1A",
  body: "#4A4A4A",
  muted: "#8A8A8A",
  line: "#E5E5E3",
  lineSoft: "#EDEDEB",
  surface: "#F1F4F2",
  brand: "#14542E",
  brandSoft: "#F1F4F2",
  danger: "#9B2F2F",
  dangerSoft: "#F7F0F0",
  warn: "#A8762A",
  warnSoft: "#FDF6EA",
  paper: "#FFFFFF",

  // 기존 픽셀아트 화면이 쓰는 이름. 값은 위 팔레트를 가리킨다.
  green: "#14542E",
  greenDark: "#0F3D21",
  greenSoft: "#F1F4F2",
  stageBg: "#F1F4F2",
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
