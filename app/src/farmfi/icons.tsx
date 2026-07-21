import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { C } from "./theme";

export type IconName =
  | "store" | "user" | "monitor" | "link" | "report" | "sprout" | "basket"
  | "check" | "drop" | "users" | "clock" | "calendar" | "bars" | "plus";
export type PixelGlyphName = "store" | "sprout" | "basket" | "bars" | "users" | "bed" | "bulb";

// ── 라인 아이콘 (원본 stroke="currentColor" → color prop) ──
export function AppIcon({ name, size = 24, color = "#333" }: { name: IconName; size?: number; color?: string }) {
  const s = {
    fill: "none",
    stroke: color,
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "store" && (
        <G {...s}>
          <Path d="M3 9h18l-2-5H5L3 9Z" />
          <Path d="M5 9v10h14V9M8 19v-6h4v6M15 12h2" />
          <Path d="M4 9c0 1.2 1 2 2.1 2S8 10.2 8 9c0 1.2 1 2 2 2s2-1 2-2c0 1.2 1 2 2 2s2-1 2-2c0 1.2.9 2 2 2s2-1 2-2" />
        </G>
      )}
      {name === "user" && (
        <G {...s}>
          <Circle cx="12" cy="7" r="3.2" />
          <Path d="M5.5 20c.4-4.2 2.6-6.5 6.5-6.5s6.1 2.3 6.5 6.5" />
        </G>
      )}
      {name === "monitor" && (
        <G {...s}>
          <Rect x="3" y="4" width="18" height="13" rx="1.5" />
          <Path d="M8 21h8M12 17v4" />
        </G>
      )}
      {name === "link" && (
        <G {...s}>
          <Path d="m9.5 14.5-2 2a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0" />
          <Path d="m14.5 9.5 2-2a3.5 3.5 0 1 1 5 5l-3 3a3.5 3.5 0 0 1-5 0M8.5 15.5l7-7" />
        </G>
      )}
      {name === "report" && (
        <G fill={color}>
          <Rect x="3.5" y="14" width="4.2" height="7" rx=".8" />
          <Rect x="9.9" y="9" width="4.2" height="12" rx=".8" />
          <Rect x="16.3" y="3" width="4.2" height="18" rx=".8" />
        </G>
      )}
      {name === "sprout" && (
        <G {...s}>
          <Path d="M12 21v-9" />
          <Path d="M12 12C7 12 5 9.8 5 5c4.8 0 7 2 7 7ZM12 11c0-4.4 2.2-6.4 7-6.4 0 4.5-2.3 6.4-7 6.4Z" />
          <Path d="M8 21h8" />
        </G>
      )}
      {name === "basket" && (
        <G {...s}>
          <Path d="M4 9h16l-1.5 10h-13L4 9ZM8 9l4-5 4 5M8 13v3M12 13v3M16 13v3" />
        </G>
      )}
      {name === "check" && (
        <G {...s}>
          <Circle cx="12" cy="12" r="9" />
          <Path d="m8 12 2.5 2.5L16.5 8" />
        </G>
      )}
      {name === "drop" && (
        <G {...s}>
          <Path d="M12 3S6.5 9.2 6.5 14a5.5 5.5 0 0 0 11 0C17.5 9.2 12 3 12 3Z" />
          <Path d="M9 15.5c.6 1.2 1.5 1.8 3 1.8" />
        </G>
      )}
      {name === "users" && (
        <G {...s}>
          <Circle cx="8" cy="8" r="3" />
          <Circle cx="16.5" cy="8.5" r="2.5" />
          <Path d="M2.5 20c.2-4 2-6 5.5-6s5.3 2 5.5 6M13 14.5c3.8-.8 7 1.2 7.5 5.5" />
        </G>
      )}
      {name === "clock" && (
        <G {...s}>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M12 7v5l3 2" />
        </G>
      )}
      {name === "calendar" && (
        <G {...s}>
          <Rect x="3" y="5" width="18" height="16" rx="2" />
          <Path d="M7 3v4M17 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
        </G>
      )}
      {name === "bars" && (
        <G {...s}>
          <Path d="M5 20v-6h3v6M10.5 20V9h3v11M16 20V4h3v16" />
        </G>
      )}
      {name === "plus" && (
        <G {...s}>
          <Path d="M12 4v16M4 12h16" />
        </G>
      )}
    </Svg>
  );
}

// ── 픽셀 글리프 (원본 fill 하드코딩 색상) ──
const P_DARK = "#252923";
const P_GREEN = "#5f973d";
const P_GREEN_DARK = "#1e603d";
const P_LIME = "#a8cf52";
const P_YELLOW = "#f2cf68";
const P_BROWN = "#8a6039";

export function PixelGlyph({ name, size = 24 }: { name: PixelGlyphName; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "sprout" && (
        <>
          <Path fill={P_DARK} d="M11 9h2v11h-2zM4 4h6v2H4zm-1 2h2v4H3zm2 4h6v2H5zm9-7h7v2h-7zm-2 2h2v6h-2zm2 6h5v2h-5zM7 20h10v2H7z" />
          <Path fill={P_LIME} d="M5 6h4v2H5zm2 2h4v2H7zm9-3h4v2h-4zm-2 2h4v3h-4z" />
          <Path fill={P_GREEN} d="M5 8h2v2H5zm4 0h2v2H9zm5 2h4v1h-4z" />
          <Path fill={P_BROWN} d="M9 19h6v2H9z" />
        </>
      )}
      {name === "store" && (
        <>
          <Path fill={P_DARK} d="M4 3h16v2h1v6h-1v10H4V11H3V5h1zm2 10v6h12v-6z" />
          <Path fill={P_YELLOW} d="M5 5h3v5H5zm6 0h3v5h-3zm6 0h2v5h-2z" />
          <Path fill={P_GREEN} d="M8 5h3v5H8zm6 0h3v5h-3z" />
          <Path fill="#fff7d9" d="M6 12h12v7H6z" />
          <Path fill={P_GREEN_DARK} d="M7 13h4v6H7zm6 1h4v3h-4z" />
        </>
      )}
      {name === "basket" && (
        <>
          <Path fill={P_DARK} d="M7 3h2v2h6V3h2v2h2v3h2v12H3V8h2V5h2zm-2 7v8h14v-8z" />
          <Path fill={P_BROWN} d="M5 10h14v8H5z" />
          <Path fill="#c18a49" d="M7 11h2v6H7zm4 0h2v6h-2zm4 0h2v6h-2z" />
          <Path fill={P_GREEN} d="M6 6h4v3H6zm8-1h4v4h-4zm-4 1h4v3h-4z" />
          <Path fill={P_LIME} d="M7 5h2v2H7zm8 1h2v2h-2zm-4-1h2v2h-2z" />
        </>
      )}
      {name === "bars" && (
        <>
          <Path fill={P_DARK} d="M3 14h5v8H3zm7-5h5v13h-5zm7-6h5v19h-5z" />
          <Path fill={P_GREEN} d="M5 16h2v4H5zm7-5h2v9h-2zm7-6h2v15h-2z" />
        </>
      )}
      {name === "users" && (
        <>
          <Path fill={P_DARK} d="M5 4h5v2h2v5h-2v2H5v-2H3V6h2zm9 1h5v2h2v5h-2v1h-5v-1h-2V7h2zM3 15h9v2h2v5H1v-5h2zm11 0h7v2h2v5h-8v-4h-1z" />
          <Path fill={P_YELLOW} d="M5 6h5v5H5zm9 1h5v4h-5z" />
          <Path fill="#fff" d="M3 17h9v3H3zm13 0h5v3h-5z" />
        </>
      )}
      {name === "bed" && (
        <>
          <Path fill={P_DARK} d="M3 5h2v14H3zm16 0h2v14h-2zM5 6h14v3H5zm0 6h14v3H5zM2 19h4v2H2zm16 0h4v2h-4z" />
          <Path fill={P_BROWN} d="M5 7h14v1H5zm0 6h14v1H5z" />
        </>
      )}
      {name === "bulb" && (
        <>
          <Path fill={P_DARK} d="M9 2h6v2h2v2h2v7h-2v2h-2v3H9v-3H7v-2H5V6h2V4h2zm0 4v6h2v3h2v-3h2V6zM9 20h6v2H9z" />
          <Path fill={P_YELLOW} d="M9 5h6v2h2v5h-2v2h-6v-2H7V7h2z" />
          <Path fill="#fff2a6" d="M10 6h3v2h-3z" />
        </>
      )}
    </Svg>
  );
}

// SalesLineChart 는 화면 파일에서 이 프리미티브들을 직접 사용
export { Svg, Path, Polyline, Circle, Line, SvgText, G };
export const CHART_GREEN = C.green;
