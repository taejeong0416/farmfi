// 앱 아이콘 → SVG 마크업. app/src/farmfi/icons.tsx 의 path 데이터를 그대로 옮긴다.
// 두 렌더러(figma-svg/gen.js, figma-plugin/render.js)가 같은 정의를 쓴다.
// viewBox 는 원본과 동일하게 24×24 이며, 배치 시 size/24 로 스케일한다.

// ── AppIcon: 선 아이콘 (원본 stroke="currentColor" → color 인자) ──
var APP_ICON_STROKE = {
  store:
    '<path d="M3 9h18l-2-5H5L3 9Z"/>' +
    '<path d="M5 9v10h14V9M8 19v-6h4v6M15 12h2"/>' +
    '<path d="M4 9c0 1.2 1 2 2.1 2S8 10.2 8 9c0 1.2 1 2 2 2s2-1 2-2c0 1.2 1 2 2 2s2-1 2-2c0 1.2.9 2 2 2s2-1 2-2"/>',
  user:
    '<circle cx="12" cy="7" r="3.2"/>' +
    '<path d="M5.5 20c.4-4.2 2.6-6.5 6.5-6.5s6.1 2.3 6.5 6.5"/>',
  monitor:
    '<rect x="3" y="4" width="18" height="13" rx="1.5"/>' +
    '<path d="M8 21h8M12 17v4"/>',
  link:
    '<path d="m9.5 14.5-2 2a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0"/>' +
    '<path d="m14.5 9.5 2-2a3.5 3.5 0 1 1 5 5l-3 3a3.5 3.5 0 0 1-5 0M8.5 15.5l7-7"/>',
  sprout:
    '<path d="M12 21v-9"/>' +
    '<path d="M12 12C7 12 5 9.8 5 5c4.8 0 7 2 7 7ZM12 11c0-4.4 2.2-6.4 7-6.4 0 4.5-2.3 6.4-7 6.4Z"/>' +
    '<path d="M8 21h8"/>',
  basket: '<path d="M4 9h16l-1.5 10h-13L4 9ZM8 9l4-5 4 5M8 13v3M12 13v3M16 13v3"/>',
  check:
    '<circle cx="12" cy="12" r="9"/>' +
    '<path d="m8 12 2.5 2.5L16.5 8"/>',
  drop:
    '<path d="M12 3S6.5 9.2 6.5 14a5.5 5.5 0 0 0 11 0C17.5 9.2 12 3 12 3Z"/>' +
    '<path d="M9 15.5c.6 1.2 1.5 1.8 3 1.8"/>',
  users:
    '<circle cx="8" cy="8" r="3"/>' +
    '<circle cx="16.5" cy="8.5" r="2.5"/>' +
    '<path d="M2.5 20c.2-4 2-6 5.5-6s5.3 2 5.5 6M13 14.5c3.8-.8 7 1.2 7.5 5.5"/>',
  clock:
    '<circle cx="12" cy="12" r="9"/>' +
    '<path d="M12 7v5l3 2"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/>' +
    '<path d="M7 3v4M17 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
  bars: '<path d="M5 20v-6h3v6M10.5 20V9h3v11M16 20V4h3v16"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
};

// report 만 원본이 <G fill> — 채움 기반이라 따로 둔다.
var APP_ICON_FILL = {
  report:
    '<rect x="3.5" y="14" width="4.2" height="7" rx=".8"/>' +
    '<rect x="9.9" y="9" width="4.2" height="12" rx=".8"/>' +
    '<rect x="16.3" y="3" width="4.2" height="18" rx=".8"/>',
};

// ── PixelGlyph: 픽셀아트 (원본 하드코딩 색) ──
var P_DARK = "#252923";
var P_GREEN = "#5f973d";
var P_GREEN_DARK = "#1e603d";
var P_LIME = "#a8cf52";
var P_YELLOW = "#f2cf68";
var P_BROWN = "#8a6039";

var PIXEL_GLYPH = {
  sprout:
    '<path fill="' + P_DARK + '" d="M11 9h2v11h-2zM4 4h6v2H4zm-1 2h2v4H3zm2 4h6v2H5zm9-7h7v2h-7zm-2 2h2v6h-2zm2 6h5v2h-5zM7 20h10v2H7z"/>' +
    '<path fill="' + P_LIME + '" d="M5 6h4v2H5zm2 2h4v2H7zm9-3h4v2h-4zm-2 2h4v3h-4z"/>' +
    '<path fill="' + P_GREEN + '" d="M5 8h2v2H5zm4 0h2v2H9zm5 2h4v1h-4z"/>' +
    '<path fill="' + P_BROWN + '" d="M9 19h6v2H9z"/>',
  store:
    '<path fill="' + P_DARK + '" d="M4 3h16v2h1v6h-1v10H4V11H3V5h1zm2 10v6h12v-6z"/>' +
    '<path fill="' + P_YELLOW + '" d="M5 5h3v5H5zm6 0h3v5h-3zm6 0h2v5h-2z"/>' +
    '<path fill="' + P_GREEN + '" d="M8 5h3v5H8zm6 0h3v5h-3z"/>' +
    '<path fill="#fff7d9" d="M6 12h12v7H6z"/>' +
    '<path fill="' + P_GREEN_DARK + '" d="M7 13h4v6H7zm6 1h4v3h-4z"/>',
  basket:
    '<path fill="' + P_DARK + '" d="M7 3h2v2h6V3h2v2h2v3h2v12H3V8h2V5h2zm-2 7v8h14v-8z"/>' +
    '<path fill="' + P_BROWN + '" d="M5 10h14v8H5z"/>' +
    '<path fill="#c18a49" d="M7 11h2v6H7zm4 0h2v6h-2zm4 0h2v6h-2z"/>' +
    '<path fill="' + P_GREEN + '" d="M6 6h4v3H6zm8-1h4v4h-4zm-4 1h4v3h-4z"/>' +
    '<path fill="' + P_LIME + '" d="M7 5h2v2H7zm8 1h2v2h-2zm-4-1h2v2h-2z"/>',
  bars:
    '<path fill="' + P_DARK + '" d="M3 14h5v8H3zm7-5h5v13h-5zm7-6h5v19h-5z"/>' +
    '<path fill="' + P_GREEN + '" d="M5 16h2v4H5zm7-5h2v9h-2zm7-6h2v15h-2z"/>',
  users:
    '<path fill="' + P_DARK + '" d="M5 4h5v2h2v5h-2v2H5v-2H3V6h2zm9 1h5v2h2v5h-2v1h-5v-1h-2V7h2zM3 15h9v2h2v5H1v-5h2zm11 0h7v2h2v5h-8v-4h-1z"/>' +
    '<path fill="' + P_YELLOW + '" d="M5 6h5v5H5zm9 1h5v4h-5z"/>' +
    '<path fill="#fff" d="M3 17h9v3H3zm13 0h5v3h-5z"/>',
  bed:
    '<path fill="' + P_DARK + '" d="M3 5h2v14H3zm16 0h2v14h-2zM5 6h14v3H5zm0 6h14v3H5zM2 19h4v2H2zm16 0h4v2h-4z"/>' +
    '<path fill="' + P_BROWN + '" d="M5 7h14v1H5zm0 6h14v1H5z"/>',
  bulb:
    '<path fill="' + P_DARK + '" d="M9 2h6v2h2v2h2v7h-2v2h-2v3H9v-3H7v-2H5V6h2V4h2zm0 4v6h2v3h2v-3h2V6zM9 20h6v2H9z"/>' +
    '<path fill="' + P_YELLOW + '" d="M9 5h6v2h2v5h-2v2h-6v-2H7V7h2z"/>' +
    '<path fill="#fff2a6" d="M10 6h3v2h-3z"/>',
};

// 아이콘 1개의 내부 마크업(24×24 좌표계)을 돌려준다. 없으면 null.
function iconBody(kind, name, color) {
  if (kind === "pixel") return PIXEL_GLYPH[name] || null;
  if (APP_ICON_FILL[name]) {
    return '<g fill="' + color + '">' + APP_ICON_FILL[name] + "</g>";
  }
  if (APP_ICON_STROKE[name]) {
    return (
      '<g fill="none" stroke="' + color + '" stroke-width="1.75" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + APP_ICON_STROKE[name] + "</g>"
    );
  }
  return null;
}

var ICON_VIEWBOX = 24;

if (typeof module !== "undefined" && module.exports) {
  module.exports = { iconBody: iconBody, ICON_VIEWBOX: ICON_VIEWBOX };
}
