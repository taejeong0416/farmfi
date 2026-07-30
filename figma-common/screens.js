// FarmFi 앱(app/, Expo RN) 8화면의 레이아웃 정의 — 렌더러 중립 트리.
// figma-svg/gen.js (SVG 출력) 와 figma-plugin/render.js (Figma 오토레이아웃) 가
// 이 한 파일을 공유한다. 화면을 고치려면 여기만 고친다.
//
// 수치·색은 각 화면의 StyleSheet 에서 그대로 옮긴다:
//   app/src/farmfi/theme.ts, components.tsx, screens/*.tsx, src/app/{index,login}.tsx

// icons.js 는 두 경로로 들어온다: gen.js 는 require, 플러그인은 단일 파일 병합.
// 병합본에선 iconBody 가 이미 최상위 스코프에 있으므로 그것을 그대로 쓴다.
// (선언되지 않은 이름에 대한 typeof 는 ReferenceError 를 던지지 않는다.)
var ICONS = typeof iconBody === "function"
  ? { iconBody: iconBody }
  : require("./icons.js");

// ── theme (app/src/farmfi/theme.ts) ──
var C = {
  green: "#1e603d",
  greenDark: "#164b2f",
  greenSoft: "#eef4ea",
  ink: "#1d1e1c",
  muted: "#656863",
  line: "#ded8cf",
  paper: "#fffefa",
  stageBg: "#efefed",
  cardLine: "#d9d1c5",
};

var FRAME_W = 430;                    // 앱 프레임 최대 폭
var PAD = 23;                         // AppShell content paddingHorizontal
var CONTENT_W = FRAME_W - PAD * 2;    // 384

// ── 표시용 값 ──
// 앱 화면은 전부 API에서 값을 받는다. 목업에는 실시간 값이 없으므로 시드
// (frontend/src/lib/seed-scenario.ts) 와 같은 품목·지점 구성의 대표값을 쓴다.
// 디자인 확인용 숫자이며 라이브 데이터가 아니다.
var S = {
  branch: "온천장 스마트팜 1호점",
  // kind/maturity 는 카드 썸네일에 쓰인다. 원본은 수확이 가장 임박한 품목을
  // 대표로 쓴다(재고 API 정렬 기준 expectedHarvestAt asc).
  stores: [
    { name: "온천장 스마트팜 1호점", status: "정상", harvest: "180봉", beds: "4개", kind: "butter", maturity: 96 },
    { name: "장전동 스마트팜 2호점", status: "정상", harvest: "165봉", beds: "4개", kind: "basil", maturity: 100 },
    { name: "명륜동 스마트팜 3호점", status: "점검 중", harvest: "142봉", beds: "4개", kind: "romaine", maturity: 61 },
  ],
  operator: { name: "박운영", role: "운영자", tasks: "오늘 할 일 2건" },
  tasks: [
    { type: "harvest", label: "수확", text: "상추 수확 시점 도래 · 재배중 120봉" },
    { type: "restock", label: "보충", text: "바질 재고 부족 · 현재 3봉 보충 필요" },
  ],
  beds: [
    { rack: "A", product: "상추", kind: "butter", maturity: 96, stage: "수확기", stock: 4, growing: 120, harvest: "수확 가능" },
    { rack: "B", product: "루꼴라", kind: "romaine", maturity: 33, stage: "생장기", stock: 22, growing: 80, harvest: "12일 후" },
    { rack: "C", product: "바질", kind: "basil", maturity: 100, stage: "수확기", stock: 3, growing: 60, harvest: "수확 가능" },
    { rack: "D", product: "방울토마토", kind: "tomato", maturity: 44, stage: "생장기", stock: 18, growing: 90, harvest: "25일 후" },
  ],
  growth: { uptime: "97", harvestToday: "180", monthly: "1,204", health: "정상", humidity: "64%" },
  monitoring: {
    uptime: "97%", anomaly: "3건", drift: "1종", state: "정상",
    sensors: [
      { label: "온도", unit: "°C", color: "#e05a3a", value: "22.4", lo: 18, hi: 26 },
      { label: "습도", unit: "%", color: "#2f8fd6", value: "64.0", lo: 55, hi: 75 },
      { label: "CO₂", unit: "ppm", color: "#7a6cd6", value: "1,050", lo: 800, hi: 1400 },
      { label: "광량", unit: "lux", color: "#d6a12f", value: "13,800", lo: 0, hi: 20000 },
      { label: "양액 pH", unit: "pH", color: "#0b7d46", value: "6.1", lo: 5.5, hi: 6.5 },
    ],
  },
  sales: {
    days: 30,
    amount: "5,842,000", quantity: "1,486", orders: "412",
    ranking: [
      { name: "방울토마토", kind: "tomato", qty: 402, count: "402봉" },
      { name: "상추", kind: "butter", qty: 388, count: "388봉" },
      { name: "루꼴라", kind: "romaine", qty: 366, count: "366봉" },
      { name: "바질", kind: "basil", qty: 330, count: "330봉" },
    ],
    recent: [
      { date: "07.29", name: "방울토마토", qty: "34봉", price: "204,000원" },
      { date: "07.29", name: "상추", qty: "31봉", price: "93,000원" },
      { date: "07.28", name: "루꼴라", qty: "28봉", price: "98,000원" },
      { date: "07.28", name: "바질", qty: "26봉", price: "104,000원" },
      { date: "07.27", name: "방울토마토", qty: "37봉", price: "222,000원" },
    ],
    // 일별 매출 스파크라인 — 30일치 정규화 비율(0~1)
    daily: [
      0.52, 0.61, 0.44, 0.7, 0.58, 0.66, 0.49, 0.74, 0.63, 0.55,
      0.81, 0.69, 0.6, 0.72, 0.51, 0.65, 0.78, 0.57, 0.68, 0.86,
      0.62, 0.71, 0.54, 0.79, 0.67, 0.9, 0.73, 0.64, 0.82, 0.76,
    ],
    xLabels: ["6/30", "7/7", "7/14", "7/21", "7/29"],
  },
  login: { email: "이메일", password: "비밀번호" },
  home: { name: "박운영", role: "운영자" },
};

// ─────────────────────────── 노드 DSL ───────────────────────────
// dir: "col" | "row" | "none" | "text" | "svg"
// 크기:  w/h = 숫자 | "fill" | 생략(hug)
// 여백:  px/py 또는 pl/pr/pt/pb, gap, mt/ml (자식 마진)
// 정렬:  justify = "between"|"center"|"end" (주축), align = "center"|"end" (교차축)
// 절대:  dir "none" 부모 안에서 absL/absT 로 자식 배치

function node(dir, o, children) {
  var n = { dir: dir, children: children || [] };
  for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) n[k] = o[k];
  return n;
}
function col(o, children) { return node("col", o, children); }
function row(o, children) { return node("row", o, children); }
function box(o) { return node("none", o, o && o.children); }
function stack(o, children) { return node("none", o, children); }   // 절대배치 컨테이너
function txt(s, o) { var n = node("text", o); n.text = s; return n; }

// 벡터 — 24×24 아이콘 또는 임의 viewBox 마크업
function svgNode(inner, vbW, vbH, w, h, name) {
  var n = node("svg", { w: w, h: h });
  n._svg = inner; n._vbW = vbW; n._vbH = vbH; n.name = name || "vector";
  return n;
}

// 앱 에셋 이미지. asset 키는 ./assets-spec.js 의 parseAssetKey 형식을 따른다.
// 원본 PNG(0.5~2.3MB)를 표시 크기로 줄인 캐시를 쓴다. 캐시가 없으면 라벨 박스로
// 떨어지므로, 이미지 없이도 레이아웃은 그대로 나온다.
function raster(label, w, h, o) {
  o = o || {};
  var n = box({
    w: w, h: h,
    bg: o.bg || "#e8e5df",
    stroke: o.stroke || null,
    strokeW: o.strokeW || 1,
    radius: o.radius != null ? o.radius : 0,
    mt: o.mt, absL: o.absL, absT: o.absT,
  });
  n._placeholder = label;
  n.name = label;
  if (o.asset) n._image = { asset: o.asset, fit: o.fit || "cover" };
  return n;
}

// ─────────────────────────── 공유 조각 ───────────────────────────

function icon(name, size, color) {
  var body = ICONS.iconBody("line", name, color || "#333");
  if (!body) return box({ w: size, h: size });
  return svgNode(body, 24, 24, size, size, "icon/" + name);
}
function pglyph(name, size) {
  var body = ICONS.iconBody("pixel", name);
  if (!body) return box({ w: size, h: size });
  return svgNode(body, 24, 24, size, size, "glyph/" + name);
}

// 마름모 (원본: 7×7 정사각형 45° 회전)
function diamond(color) {
  return box({ w: 7, h: 7, bg: color, rotation: 45 });
}
// BranchSelect 의 chevron (원본: 8×8 우·하 테두리만 45° 회전 → V 모양)
function chevronDown() {
  return svgNode(
    '<path d="M1 1.5 L6 6.5 L11 1.5" fill="none" stroke="' + C.green +
      '" stroke-width="2" stroke-linecap="square"/>',
    12, 8, 12, 8, "chevron"
  );
}

// SectionTitle (app/src/farmfi/components.tsx)
function sectionTitle(text, iconName) {
  var kids = [];
  if (iconName === "sprout") kids.push(pglyph("sprout", 21));
  else if (iconName === "users") kids.push(pglyph("users", 24));
  else if (iconName) kids.push(icon(iconName, 20, C.green));
  kids.push(txt(text, { size: 18, weight: 600, spacing: -0.45, color: C.ink }));
  return row({ name: "SectionTitle", gap: 8, align: "center" }, kids);
}

// BranchSelect (app/src/farmfi/components.tsx)
function branchSelect(label, withCalendar) {
  var kids = [
    row({
      name: "branchSelect", w: 184, h: 44, gap: 6, px: 11, align: "center",
      bg: "#ffffff", stroke: "#4f875f", strokeW: 1.5, radius: 6,
    }, [
      pglyph("store", 24),
      // 원본 numberOfLines={1} — 남는 폭(184-22-24-6-12-6=114)에서 잘린다.
      txt(label, { size: 15, weight: 600, color: C.ink, w: "fill", maxLines: 1 }),
      chevronDown(),
    ]),
  ];
  if (withCalendar) {
    kids.push(row({ name: "calendarBtn", w: 42, h: 42, align: "center", justify: "center" }, [
      icon("calendar", 25, C.ink),
    ]));
  }
  return row({ name: "BranchRow", w: "fill", h: 46, align: "center", justify: "between", gap: 12 }, kids);
}

// 하단 네비게이션 (app/src/farmfi/components.tsx BottomNavigation)
var APP_TABS = [
  { key: "store", label: "매장", icon: "store" },
  { key: "assignment", label: "운영", icon: "sprout" },
  { key: "growth", label: "모니터링", icon: "monitor" },
  { key: "inventory", label: "연동", icon: "link" },
  { key: "sales", label: "리포트", icon: "report" },
];

function bottomNav(active) {
  // 원본: active 가 growth/inventory 일 때만 선택 탭에 연한 배경.
  var softBg = active === "growth" || active === "inventory";
  var tabs = APP_TABS.map(function (t) {
    var on = t.key === active;
    return col({
      name: "tab/" + t.key, w: "fill", h: "fill", align: "center", justify: "center", radius: 10,
      bg: on && softBg ? C.greenSoft : null,
    }, [
      icon(t.icon, 25, on ? C.green : "#676a67"),
      txt(t.label, { size: 10, weight: on ? 700 : 500, color: on ? C.green : "#676a67", mt: 5 }),
    ]);
  });
  return col({ name: "BottomNav", w: "fill" }, [
    box({ w: "fill", h: 1, bg: "#e3dfd8" }),                 // 원본 borderTopWidth
    row({ w: "fill", h: 75, px: 10, py: 8, bg: C.paper }, tabs),
  ]);
}

// 앱 셸 — 프레임 + 콘텐츠 패딩 + 하단 네비
function shell(name, active, children) {
  return col({ name: name, w: FRAME_W, bg: C.paper }, [
    col({ name: "content", w: "fill", pl: PAD, pr: PAD, pt: 14, pb: 24 }, children),
    bottomNav(active),
  ]);
}
// 네비 없는 화면(로그인·홈)은 프레임만
function plainFrame(name, bg, children) {
  return col({ name: name, w: FRAME_W, h: 932, bg: bg, justify: "center", px: 24 }, children);
}

// ─────────────────────────── 1. StoreScreen ───────────────────────────

function storeCard(store, selected) {
  var pad = selected ? 9 : 10;
  var strokeW = selected ? 2 : 1;
  // 원본 thumbnail width "41%" — RN 기준 content box = 384 - 테두리 - 패딩
  var inner = CONTENT_W - strokeW * 2 - pad * 2;
  var thumbW = Math.round(inner * 0.41);

  var badge = selected
    ? row({ name: "badge", gap: 3, h: 30, radius: 5, bg: C.green, px: 7, align: "center" }, [
        icon("check", 14, "#ffffff"),
        txt("선택됨", { size: 9, weight: 700, color: "#ffffff" }),
      ])
    : row({ name: "badge", gap: 3, h: 30, radius: 5, bg: "#ffffff", stroke: "#bcb0a0", px: 7, align: "center" }, [
        box({ w: 11, h: 11, stroke: "#333333", strokeW: 1.5, radius: 6 }),
        txt("선택", { size: 9, weight: 700, color: "#333333" }),
      ]);

  function fact(iconNode, label, value) {
    return row({ name: "fact", gap: 6, w: "fill", align: "center" }, [
      row({ w: 23, align: "center" }, [iconNode]),
      txt(label, { size: 12, color: C.ink, w: "fill" }),
      txt(value, { size: 14, weight: 600, color: C.green }),
    ]);
  }

  return row({
    name: "StoreCard/" + store.name + (selected ? " (selected)" : ""),
    gap: 11, w: "fill", h: 154, px: pad, py: pad, bg: "#ffffff", radius: 10,
    stroke: selected ? C.green : "#ded5c9", strokeW: strokeW, align: "center",
  }, [
    raster("재배 랙", thumbW, 132, {
      stroke: "#877e72", radius: 8,
      asset: "rack:" + store.kind + ":" + store.maturity + ":compact",
    }),
    col({ name: "copy", gap: 9, w: "fill", justify: "center" }, [
      row({ name: "heading", w: "fill", justify: "between", align: "center", gap: 7 }, [
        txt(store.name, { size: 20, weight: 700, spacing: -0.9, color: C.ink, w: "fill", maxLines: 1 }),
        badge,
      ]),
      fact(pglyph("sprout", 20), "농장 상태", store.status),
      fact(raster("작물", 23, 23, { bg: C.greenSoft, asset: "crop:" + store.kind }), "수확 가능", store.harvest),
      fact(pglyph("bed", 20), "재배 베드", store.beds),
    ]),
  ]);
}

function storeScreen() {
  return shell("App / 1 Store", "store", [
    col({ name: "hero", align: "center", pt: 39, pb: 35, w: "fill", gap: 12 }, [
      pglyph("store", 69),
      txt("매장 선택", { size: 31, weight: 700, spacing: -1.4, color: C.ink }),
      row({ name: "heroSub", gap: 13, align: "center" }, [
        diamond("#96866e"),
        txt("관리할 매장을 선택해주세요.", { size: 13, color: "#444743" }),
        diamond("#96866e"),
      ]),
    ]),
    col({ name: "listSection", gap: 11, w: "fill" }, [
      row({ name: "listHeading", w: "fill", justify: "between", align: "center" }, [
        row({ gap: 8, align: "center" }, [
          pglyph("store", 25),
          txt("등록된 매장", { size: 19, weight: 600, spacing: -0.48, color: C.ink }),
        ]),
        row({ name: "addBtn", gap: 5, h: 38, radius: 7, bg: "#ffffff", stroke: C.green, strokeW: 1.4, px: 11, align: "center" }, [
          icon("plus", 22, C.green),
          txt("매장 추가", { size: 13, weight: 700, color: C.green }),
        ]),
      ]),
      col({ name: "cards", gap: 12, w: "fill" }, S.stores.map(function (s, i) {
        return storeCard(s, i === 0);
      })),
    ]),
    row({
      name: "tip", gap: 9, w: "fill", py: 12, px: 14, radius: 9,
      bg: "#fbfdf9", stroke: "#6b9a75", mt: 17,
    }, [
      pglyph("bulb", 23),
      col({ gap: 5, w: "fill" }, [
        txt("TIP", { size: 14, weight: 700, spacing: 0.7, color: C.green }),
        // 384 - 테두리2 - px28 - 글리프23 - gap9 = 322
        txt("매장을 선택하면 운영, 모니터링, 리포트 정보를 확인할 수 있어요.", {
          size: 11, line: 16, color: "#454844", w: "fill", wrap: true,
        }),
      ]),
    ]),
  ]);
}

// ─────────────────────────── 2. AssignmentScreen ───────────────────────────

var FLOOR_LABELS = [
  { text: "베드 A", left: 0.23, top: 0.18, w: 46 },
  { text: "베드 B", left: 0.77, top: 0.18, w: 46 },
  { text: "베드 C", left: 0.23, top: 0.69, w: 46 },
  { text: "베드 D", left: 0.77, top: 0.69, w: 46 },
  { text: "작업대", left: 0.5, top: 0.43, w: 40 },
  { text: "채소 판매 코너", left: 0.5, top: 0.88, w: 92 },
];

function floorPlan() {
  var w = CONTENT_W;
  var h = Math.round(w / 1.09);      // 원본 aspectRatio 1.09
  var kids = [
    raster("매장 평면도", w, h, {
      bg: "#eee9dd", stroke: "#8a8175", radius: 6, asset: "plain:floorPlan",
    }),
    raster("토마토 베드", Math.round(w * 0.302), Math.round(h * 0.205), {
      bg: "#d8cdb4", absL: Math.round(w * 0.605), absT: Math.round(h * 0.551),
      asset: "plain:tomatoBed",
    }),
  ];
  FLOOR_LABELS.forEach(function (l) {
    kids.push(row({
      name: "floorLabel/" + l.text,
      radius: 3, bg: "#2d2a24", bgOpacity: 0.72, px: 8, py: 5,
      absL: Math.round(w * l.left - l.w / 2), absT: Math.round(h * l.top - 11),
    }, [txt(l.text, { size: 13, color: "#ffffff" })]));
  });
  return stack({ name: "floorPlan", w: w, h: h, mt: 9 }, kids);
}

function assignmentScreen() {
  return shell("App / 2 Assignment", "assignment", [
    branchSelect(S.branch),
    col({ name: "intro", pt: 21, pb: 13, align: "center", w: "fill", gap: 9 }, [
      txt("운영자 배정", { size: 30, weight: 700, spacing: -1.6, color: C.ink }),
      txt("매장의 운영자를 배정하고 근무 정보를 관리해주세요.", { size: 13, color: "#4f524e" }),
    ]),

    col({ name: "operatorSection", w: "fill", mt: 8 }, [
      sectionTitle("현재 운영자", "users"),
      row({
        name: "operatorCard", gap: 9, w: "fill", h: 108, align: "center", mt: 9,
        pl: 8, pr: 14, bg: "#ffffff", stroke: "#d9d1c7", radius: 10,
      }, [
        raster("운영자 사진", 84, 101, { bg: "#efeae1", asset: "plain:operator", fit: "contain" }),
        col({ name: "operatorCopy", w: "fill" }, [
          row({ gap: 9, align: "center" }, [
            txt(S.operator.name, { size: 24, weight: 700, spacing: -1.2, color: C.ink }),
            row({ name: "workBadge", radius: 5, bg: C.green, px: 8, py: 6 }, [
              txt(S.operator.role, { size: 10, color: "#ffffff" }),
            ]),
          ]),
          row({ gap: 7, align: "center", mt: 11, w: "fill" }, [
            icon("clock", 18, "#30322f"),
            txt(S.operator.tasks, { size: 12, color: "#30322f", w: "fill" }),
          ]),
        ]),
        txt("›", { size: 35, weight: 300, color: C.ink }),
      ]),
    ]),

    col({ name: "taskSection", w: "fill", mt: 8 }, [
      sectionTitle("오늘 할 일", "check"),
      col({ name: "taskList", w: "fill", gap: 6, mt: 9 }, S.tasks.map(function (t) {
        return row({
          name: "task/" + t.label, gap: 9, w: "fill", h: 46, align: "center",
          px: 10, py: 8, bg: "#ffffff", stroke: "#e2dcd4", radius: 8,
        }, [
          row({ name: "taskBadge", w: 38, radius: 5, px: 7, py: 5, justify: "center",
            bg: t.type === "harvest" ? C.green : "#b8722c" }, [
            txt(t.label, { size: 10, weight: 700, color: "#ffffff" }),
          ]),
          txt(t.text, { size: 12, line: 17, color: "#30322f", w: "fill", wrap: true }),
        ]);
      })),
    ]),

    col({ name: "floorSection", w: "fill", mt: 15 }, [
      sectionTitle("매장 공간 구조", "sprout"),
      floorPlan(),
    ]),

    row({
      name: "changeBtn", w: "fill", h: 50, gap: 10, align: "center", justify: "center",
      bg: C.green, radius: 8, mt: 12,
    }, [
      icon("user", 23, "#ffffff"),
      txt("운영자 변경", { size: 16, weight: 600, color: "#ffffff" }),
    ]),
  ]);
}

// ─────────────────────────── 3. GrowthScreen ───────────────────────────

function growthScreen() {
  var bed = S.beds[0];
  var rackW = CONTENT_W - 2;
  var rackH = Math.round(rackW / 1.25);   // 원본 aspectRatio 1.25

  function metric(glyphName, label, value, unit) {
    return col({
      name: "metric/" + label, w: "fill", h: 91, align: "center", justify: "center",
      px: 3, py: 8, bg: C.paper, stroke: "#d9d1c5", radius: 10,
    }, [
      row({ gap: 4, align: "center" }, [
        pglyph(glyphName, 18),
        txt(label, { size: 10, weight: 600, color: "#333333" }),
      ]),
      row({ align: "baseline", mt: 8 }, [
        txt(value, { size: 25, weight: 700, spacing: -1, color: C.green }),
        txt(unit, { size: 12, weight: 500, color: "#151715" }),
      ]),
    ]);
  }

  return shell("App / 3 Growth", "growth", [
    branchSelect(S.branch),
    col({ name: "hero", align: "center", pt: 13, pb: 12, w: "fill", gap: 0 }, [
      pglyph("sprout", 47),
      txt("성장 모니터링", { size: 29, weight: 700, spacing: -1.2, color: C.ink, mt: 7 }),
      row({ name: "heroSub", gap: 14, align: "center", mt: 9 }, [
        diamond("#9b8c73"),
        txt("실시간으로 작물의 성장 상태를 확인하세요.", { size: 13, color: "#474a46" }),
        diamond("#9b8c73"),
      ]),
    ]),

    row({ name: "metrics", w: "fill", gap: 7 }, [
      metric("sprout", "센서 가동률", S.growth.uptime, "%"),
      metric("basket", "오늘 수확 가능", S.growth.harvestToday, "봉"),
      metric("bars", "이번 달 수확량", S.growth.monthly, "봉"),
    ]),

    row({ name: "monitorBtn", w: "fill", h: 46, bg: C.green, radius: 10, align: "center", justify: "center", mt: 12 }, [
      txt("상세 센서 모니터링 →", { size: 14, weight: 700, color: "#ffffff" }),
    ]),

    col({ name: "bedSection", w: "fill", mt: 18 }, [
      sectionTitle("실시간 성장 베드", "sprout"),
      row({ name: "bedTabs", w: "fill", mt: 10 }, S.beds.map(function (b, i) {
        var on = i === 0;
        return row({
          name: "bedTab/" + b.rack, w: "fill", h: 41, align: "center", justify: "center",
          bg: on ? C.green : "#ffffff", stroke: on ? C.green : "#d6cec2",
        }, [
          txt("베드 " + b.rack, { size: 13, weight: on ? 700 : 400, color: on ? "#ffffff" : C.ink }),
        ]);
      })),
      col({ name: "rackCard", w: "fill", bg: "#ffffff", stroke: "#d6cec2" }, [
        stack({ name: "rackImage", w: rackW, h: rackH }, [
          raster("재배 랙 · " + bed.product, rackW, rackH, {
            bg: "#f4f3ef",
            asset: "rack:" + bed.kind + ":" + bed.maturity + ":full",
          }),
          row({
            name: "stageBadge", absL: 9, absT: 9, px: 8, py: 5, radius: 5,
            bg: C.paper, bgOpacity: 0.91, stroke: C.green, strokeOpacity: 0.26,
          }, [
            txt(bed.product + " · " + bed.stage + " " + bed.maturity + "%", {
              size: 10, weight: 700, color: C.greenDark,
            }),
          ]),
        ]),
        row({ name: "rackStatus", w: "fill", h: 66, align: "center" }, [
          row({ w: "fill", gap: 9, align: "center", justify: "center" }, [
            icon("check", 30, C.green),
            col({}, [
              txt("생육 상태", { size: 11, color: "#666862" }),
              txt(S.growth.health, { size: 17, weight: 600, color: C.green }),
            ]),
          ]),
          box({ w: 1, h: 44, bg: "#ddd7ce" }),
          row({ w: "fill", gap: 9, align: "center", justify: "center" }, [
            icon("drop", 30, C.green),
            col({}, [
              txt("습도", { size: 11, color: "#666862" }),
              txt(S.growth.humidity, { size: 17, weight: 600, color: C.green }),
            ]),
          ]),
        ]),
      ]),
    ]),
  ]);
}

// ─────────────────────────── 4. InventoryScreen ───────────────────────────

function inventoryScreen() {
  var maxStock = S.beds.reduce(function (m, b) { return Math.max(m, b.stock); }, 0);

  var stockRows = S.beds.map(function (b, i) {
    var sel = i === 0;
    return row({
      name: "stockRow/" + b.product, w: "fill", h: 40, gap: 7, align: "center",
      px: 4, radius: 6, bg: sel ? "#f1f6ef" : null,
    }, [
      raster("작물", 40, 40, { bg: C.greenSoft, asset: "crop:" + b.kind }),
      col({ name: "stockMid", w: "fill" }, [
        txt(b.product, { size: 13, color: C.ink }),
        stack({ name: "bar", w: "fill", h: 7, bg: "#f0eeea", radius: 4, mt: 6 }, [
          box({ wPct: b.stock / maxStock, h: 7, bg: C.green, radius: 4, absL: 0, absT: 0 }),
        ]),
      ]),
      // 원본 stockQty — 값(14/600) + 중첩 단위(9/500), 폭 47 우측 정렬
      row({ w: 47, justify: "end", align: "baseline" }, [
        txt(String(b.stock), { size: 14, weight: 600, color: C.ink }),
        txt("봉", { size: 9, weight: 500, color: C.ink }),
      ]),
    ]);
  });

  // 생장 연동 현황 — 카드 px8, 행 px6, flex 1.55 : 0.95 : 0.95 : 0.72
  var linkedInner = CONTENT_W - 2 - 16 - 2 - 12;
  var flexSum = 1.55 + 0.95 + 0.95 + 0.72;
  var colW = function (f) { return Math.round(linkedInner * f / flexSum); };

  var linkedRows = S.beds.map(function (b, i) {
    var sel = i === 0;
    return row({
      name: "linkedBed/" + b.rack, w: "fill", h: 70, align: "center", px: 6, py: 4,
      bg: sel ? "#f8fbf7" : "#ffffff", stroke: sel ? "#86aa90" : "#e2dcd4", radius: 8,
    }, [
      col({ name: "bedPreview", w: colW(1.55), h: "fill", justify: "center", pl: 3, pr: 7 }, [
        txt("베드 " + b.rack, { size: 13, weight: 700, color: C.green }),
        // 원본 MiniRackPlant 는 marginLeft -5 로 서로 겹친다 → 음수 gap 으로 옮긴다.
        row({ name: "bedPlants", h: 31, align: "end", gap: -5, mt: 2 }, [
          raster("모형 작물", 24, 28, { bg: null, asset: "plant:" + b.kind, fit: "contain" }),
          raster("모형 작물", 24, 28, { bg: null, asset: "plant:" + b.kind, fit: "contain" }),
          raster("모형 작물", 24, 28, { bg: null, asset: "plant:" + b.kind, fit: "contain" }),
          raster("모형 작물", 24, 28, { bg: null, asset: "plant:" + b.kind, fit: "contain" }),
        ]),
        box({ w: colW(1.55) - 10, h: 6, bg: "#74502e", stroke: "#493420", strokeW: 2, mt: 2 }),
      ]),
      col({ name: "col/product", w: colW(0.95), px: 7 }, [
        txt(b.product, { size: 11, color: C.ink }),
        row({ mt: 5, align: "baseline", gap: 2 }, [
          txt("성숙도", { size: 8, color: "#5e625d" }),
          txt(b.maturity + "%", { size: 12, color: C.green }),
        ]),
      ]),
      col({ name: "col/harvest", w: colW(0.95), px: 7 }, [
        txt("예상 수확", { size: 8, color: "#5e625d" }),
        txt(b.harvest, { size: 11, color: C.ink, mt: 5 }),
      ]),
      col({ name: "col/yield", w: colW(0.72), align: "center" }, [
        txt("예상 수확량", { size: 8, color: "#5e625d" }),
        row({ mt: 5, align: "baseline" }, [
          txt(String(b.growing), { size: 15, weight: 600, color: C.green }),
          txt("봉", { size: 8, color: C.green }),
        ]),
      ]),
    ]);
  });

  return shell("App / 4 Inventory", "inventory", [
    branchSelect(S.branch),
    col({ name: "intro", w: "fill", px: 4, pt: 18, pb: 13 }, [
      txt("재고 · 생육 연동", { size: 29, weight: 700, spacing: -1.6, color: C.ink }),
      txt("재고와 생육 상태를 함께 확인하세요.", { size: 14, color: "#4f524e", mt: 9 }),
    ]),
    col({ name: "stockCard", w: "fill", px: 14, pt: 13, pb: 11, bg: "#ffffff", stroke: C.line, radius: 10 }, [
      sectionTitle("매장 재고 현황"),
      col({ name: "stockList", w: "fill", gap: 4, mt: 10 }, stockRows),
    ]),
    col({ name: "linkedCard", w: "fill", px: 8, pt: 13, pb: 7, mt: 10, bg: "#ffffff", stroke: C.line, radius: 10 }, [
      row({ px: 7 }, [sectionTitle("생장 연동 현황")]),
      col({ name: "linkedBeds", w: "fill", gap: 5, mt: 9 }, linkedRows),
    ]),
  ]);
}

// ─────────────────────────── 5. MonitoringScreen ───────────────────────────

// 센서 라인차트 — 정상범위 밴드 + 이상치 마커 (원본 SensorChart)
var CHART_W = CONTENT_W - 28;   // 카드 px14 제외 = 356
var CHART_H = 92;
// 표시용 시계열(0~1 정규화). 화면마다 다른 곡선을 보이도록 위상만 바꿔 쓴다.
var SENSOR_SERIES = [0.42, 0.55, 0.48, 0.62, 0.7, 0.58, 0.66, 0.51, 0.6, 0.74, 0.68, 0.57, 0.63, 0.49, 0.59];

function sensorChart(sensor, phase) {
  var pad = { l: 4, r: 4, t: 8, b: 8 };
  var innerW = CHART_W - pad.l - pad.r;
  var innerH = CHART_H - pad.t - pad.b;
  var n = SENSOR_SERIES.length;
  var vals = SENSOR_SERIES.map(function (v, i) { return SENSOR_SERIES[(i + phase) % n]; });

  var xAt = function (i) { return pad.l + (i / (n - 1)) * innerW; };
  var yAt = function (v) { return pad.t + innerH - v * innerH; };

  var d = vals.map(function (v, i) {
    return (i === 0 ? "M" : "L") + xAt(i).toFixed(1) + " " + yAt(v).toFixed(1);
  }).join(" ");

  // 정상범위 밴드 — 표시용으로 값 분포의 0.3~0.85 구간에 놓는다.
  var yHi = yAt(0.85), yLo = yAt(0.3);
  var parts = [
    '<rect x="' + pad.l + '" y="' + yHi.toFixed(1) + '" width="' + innerW +
      '" height="' + (yLo - yHi).toFixed(1) + '" fill="' + sensor.color + '" opacity="0.08"/>',
    '<line x1="' + pad.l + '" y1="' + yHi.toFixed(1) + '" x2="' + (CHART_W - pad.r) + '" y2="' + yHi.toFixed(1) +
      '" stroke="' + sensor.color + '" stroke-width="1" stroke-dasharray="3,3" opacity="0.3"/>',
    '<line x1="' + pad.l + '" y1="' + yLo.toFixed(1) + '" x2="' + (CHART_W - pad.r) + '" y2="' + yLo.toFixed(1) +
      '" stroke="' + sensor.color + '" stroke-width="1" stroke-dasharray="3,3" opacity="0.3"/>',
    '<path d="' + d + '" stroke="' + sensor.color + '" stroke-width="2" fill="none"/>',
  ];
  // 범위를 벗어난 지점에 이상치 마커
  vals.forEach(function (v, i) {
    if (v > 0.85 || v < 0.3) {
      parts.push('<circle cx="' + xAt(i).toFixed(1) + '" cy="' + yAt(v).toFixed(1) + '" r="3" fill="#e05a3a"/>');
    }
  });
  return svgNode(parts.join(""), CHART_W, CHART_H, CHART_W, CHART_H, "chart/" + sensor.label);
}

function monitoringScreen() {
  function tile(label, value, warn) {
    return col({
      name: "tile/" + label, w: "fill", h: 70, align: "center", justify: "center",
      py: 8, px: 3, bg: C.paper, stroke: "#d9d1c5", radius: 10,
    }, [
      txt(label, { size: 10, weight: 600, color: "#555555" }),
      txt(value, { size: 18, weight: 700, spacing: -0.5, color: warn ? "#c0492f" : C.green, mt: 6 }),
    ]);
  }

  var chips = S.stores.map(function (s, i) {
    var on = i === 0;
    return row({
      name: "chip/" + s.name, h: 38, px: 14, align: "center",
      bg: on ? C.green : "#ffffff", stroke: on ? C.green : "#d6cec2", radius: 9,
    }, [
      // 원본 chip maxWidth 160 → px14×2 + 테두리2 를 뺀 130 에서 잘린다.
      txt(s.name, { size: 13, weight: on ? 700 : 600, color: on ? "#ffffff" : C.ink, w: 130, maxLines: 1 }),
    ]);
  });

  var ranges = [{ label: "24시간", on: false }, { label: "7일", on: true }, { label: "30일", on: false }];

  var sensorCards = S.monitoring.sensors.map(function (sensor, i) {
    return col({
      name: "sensorCard/" + sensor.label, w: "fill", p: 14, mt: 12,
      bg: "#ffffff", stroke: "#d9d1c5", radius: 11,
    }, [
      row({ name: "sensorHead", w: "fill", justify: "between", align: "center" }, [
        row({ gap: 7, align: "center" }, [
          box({ w: 9, h: 9, bg: sensor.color, radius: 5 }),
          txt(sensor.label, { size: 14, weight: 700, color: C.ink }),
        ]),
        row({ align: "baseline", gap: 3 }, [
          txt(sensor.value, { size: 17, weight: 700, color: C.ink }),
          txt(sensor.unit, { size: 11, weight: 500, color: "#888888" }),
        ]),
      ]),
      box({ w: "fill", h: 8 }),                                  // 원본 marginBottom 8
      sensorChart(sensor, i * 3),
      txt("정상범위 " + sensor.lo + "–" + sensor.hi + " " + sensor.unit, {
        size: 11, color: "#888888", mt: 6,
      }),
    ]);
  });

  return shell("App / 5 Monitoring", "growth", [
    col({ name: "hero", align: "center", pt: 10, pb: 12, w: "fill" }, [
      pglyph("sprout", 44),
      txt("실시간 생육 모니터링", { size: 26, weight: 700, spacing: -1, color: C.ink, mt: 7 }),
      // 원본 paddingHorizontal 12 → 384-24 = 360
      txt("센서 시계열과 이상탐지(스파이크·드리프트·범위이탈)를 확인하세요.", {
        size: 12, line: 18, color: "#474a46", w: 360, wrap: true, alignText: "center", mt: 7,
      }),
    ]),
    // 원본은 가로 ScrollView — 칩이 프레임을 넘어가고 넘친 만큼 잘린다.
    row({ name: "chipRow", w: "fill", gap: 8, mt: 4, clip: true }, chips),
    row({ name: "rangeRow", w: "fill", gap: 7, mt: 12 }, ranges.map(function (r) {
      return row({
        name: "range/" + r.label, w: "fill", h: 38, align: "center", justify: "center",
        bg: r.on ? C.greenSoft : "#ffffff", stroke: r.on ? C.green : "#d6cec2", radius: 9,
      }, [
        txt(r.label, { size: 13, weight: r.on ? 700 : 600, color: r.on ? C.green : C.ink }),
      ]);
    })),
    row({ name: "summary", w: "fill", gap: 7, mt: 16 }, [
      tile("가동률", S.monitoring.uptime),
      tile("이상 스파이크", S.monitoring.anomaly),
      tile("드리프트", S.monitoring.drift),
      tile("현재 상태", S.monitoring.state),
    ]),
    col({ name: "sensors", w: "fill", mt: 20 }, [sectionTitle("센서 시계열", "sprout")].concat(sensorCards)),
  ]);
}

// ─────────────────────────── 6. SalesScreen ───────────────────────────

// 일별 매출 라인차트 (원본 SalesLineChart — viewBox 320×126, 카드폭에 맞춰 늘어남)
function salesChart(w) {
  var vbW = 320, vbH = 126, padX = 40, padY = 12;
  var d = S.sales.daily;
  var pts = d.map(function (v, i) {
    return {
      x: padX + (i / (d.length - 1)) * (vbW - padX - 8),
      y: vbH - padY - v * (vbH - padY * 2),
    };
  });
  var parts = [];
  // 가로 눈금 + 좌측 라벨 (원본 max 를 만원 단위로 표시)
  var gridMax = 100000;
  [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
    var y = vbH - padY - f * (vbH - padY * 2);
    parts.push('<line x1="' + padX + '" x2="' + (vbW - 8) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) +
      '" stroke="#dadbd7" stroke-dasharray="3 3" stroke-width="1"/>');
    var label = f === 0 ? "0" : Math.round(gridMax * f / 10000) + "만";
    parts.push('<text x="2" y="' + (y + 3).toFixed(1) + '" fill="#636660" font-size="8">' + label + "</text>");
  });
  parts.push('<polyline points="' + pts.map(function (p) {
    return p.x.toFixed(1) + "," + p.y.toFixed(1);
  }).join(" ") + '" fill="none" stroke="' + C.green + '" stroke-width="2.1" stroke-linejoin="round"/>');
  pts.forEach(function (p) {
    parts.push('<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) +
      '" r="3" fill="#fff" stroke="' + C.green + '" stroke-width="2"/>');
  });
  return svgNode(parts.join(""), vbW, vbH, w, Math.round(w * vbH / vbW), "chart/일별매출");
}

function salesScreen() {
  var cardInner = CONTENT_W - 2 - 24;         // 카드 테두리 + px12
  var maxRank = S.sales.ranking.reduce(function (m, r) { return Math.max(m, r.qty); }, 0);

  return shell("App / 6 Sales", "sales", [
    branchSelect(S.branch, true),
    txt("판매 데이터 리포트", { size: 25, weight: 700, spacing: -1, color: C.ink, mt: 16 }),

    col({ name: "summaryCard", w: "fill", px: 12, pt: 13, pb: 10, mt: 11, bg: "#ffffff", stroke: C.line, radius: 10 }, [
      sectionTitle("최근 " + S.sales.days + "일 판매 요약"),
      // 원본은 가운데 항목에 borderLeft/borderRight 만 둔다 → 구분선 2개로 옮긴다.
      row({ name: "summaryRow", w: "fill", mt: 12, align: "center" }, [
        col({ w: "fill", px: 10 }, [
          txt("매출(원)", { size: 11, color: "#252725" }),
          txt(S.sales.amount, { size: 17, weight: 700, color: C.green, mt: 6 }),
        ]),
        box({ w: 1, h: 42, bg: "#e1dcd4" }),
        col({ w: "fill", px: 10 }, [
          txt("판매량", { size: 11, color: "#252725" }),
          row({ align: "baseline", mt: 6 }, [
            txt(S.sales.quantity, { size: 17, weight: 700, color: C.green }),
            txt("봉", { size: 11, weight: 500, color: C.green }),
          ]),
        ]),
        box({ w: 1, h: 42, bg: "#e1dcd4" }),
        col({ w: "fill", px: 10 }, [
          txt("주문수", { size: 11, color: "#252725" }),
          row({ align: "baseline", mt: 6 }, [
            txt(S.sales.orders, { size: 17, weight: 700, color: C.green }),
            txt("건", { size: 11, weight: 500, color: C.green }),
          ]),
        ]),
      ]),
    ]),

    col({ name: "chartCard", w: "fill", px: 12, pt: 12, pb: 9, mt: 10, bg: "#ffffff", stroke: C.line, radius: 10 }, [
      sectionTitle("일별 매출"),
      salesChart(cardInner),
      row({ name: "chartLabels", w: "fill", justify: "between", pl: 39, pr: 3 },
        S.sales.xLabels.map(function (l) { return txt(l, { size: 9, color: "#5f625d" }); })),
    ]),

    col({ name: "rankingCard", w: "fill", p: 12, mt: 10, bg: "#ffffff", stroke: C.line, radius: 10 }, [
      sectionTitle("인기 품목 TOP 4"),
      col({ name: "rankingRows", w: "fill", gap: 5, mt: 9 }, S.sales.ranking.map(function (r) {
        return row({ name: "rank/" + r.name, w: "fill", gap: 5, align: "center" }, [
          raster("작물", 31, 31, { bg: C.greenSoft, asset: "crop:" + r.kind }),
          txt(r.name, { size: 12, color: C.ink, w: 72, maxLines: 1 }),
          stack({ name: "bar", w: "fill", h: 7, bg: "#f0eeea", radius: 4 }, [
            box({ wPct: r.qty / maxRank, h: 7, bg: C.green, radius: 4, absL: 0, absT: 0 }),
          ]),
          txt(r.count, { size: 12, weight: 700, color: C.green, w: 50, alignText: "right" }),
        ]);
      })),
    ]),

    col({ name: "historyCard", w: "fill", px: 12, pt: 12, pb: 8, mt: 10, bg: "#ffffff", stroke: C.line, radius: 10 }, [
      sectionTitle("최근 판매 내역"),
      col({ name: "historyList", w: "fill", mt: 4 }, S.sales.recent.map(function (r, i) {
        return row({
          name: "history/" + i, w: "fill", h: 30, align: "center",
          borderBottom: i < S.sales.recent.length - 1 ? "#ebe6df" : null,
        }, [
          txt(r.date, { size: 11, color: C.ink, w: 60 }),
          txt(r.name, { size: 11, color: C.ink, w: "fill", maxLines: 1 }),
          txt(r.qty, { size: 11, color: C.ink, w: 45 }),
          txt(r.price, { size: 11, color: C.ink, w: 73, alignText: "right" }),
        ]);
      })),
    ]),
  ]);
}

// ─────────────────────────── 7. HomeScreen (src/app/index.tsx) ───────────────────────────
// FarmFi 픽셀 디자인계열이 아닌 Expo 스캐폴딩 화면. 원본 색을 그대로 옮긴다.

function homeScreen() {
  return plainFrame("App / 7 Home", "#ffffff", [
    txt(S.home.name + "님, 환영합니다", { size: 24, weight: 700, color: "#111827" }),
    row({ name: "roleBadge", bg: "#dcfce7", radius: 999, px: 12, py: 4, mt: 8 }, [
      txt(S.home.role, { size: 13, weight: 700, color: "#16a34a" }),
    ]),
    txt("역할별 대시보드는 다음 단계에서 연결됩니다.", { size: 14, color: "#6b7280", mt: 16 }),
    row({ name: "logoutBtn", w: "fill", py: 12, mt: 32, stroke: "#d1d5db", radius: 10, justify: "center" }, [
      txt("로그아웃", { size: 15, weight: 600, color: "#374151" }),
    ]),
  ]);
}

// ─────────────────────────── 8. LoginScreen (src/app/login.tsx) ───────────────────────────

function loginScreen() {
  function input(placeholder) {
    return row({
      name: "input/" + placeholder, w: "fill", px: 14, py: 12,
      stroke: "#d1d5db", radius: 10, mt: 0, mb: 12,
    }, [
      txt(placeholder, { size: 16, color: "#9ca3af" }),
    ]);
  }
  return plainFrame("App / 8 Login", "#ffffff", [
    txt("FarmFi", { size: 40, weight: 700, color: "#16a34a", w: "fill", alignText: "center" }),
    txt("도심 스마트팜 STO 플랫폼", { size: 14, color: "#6b7280", w: "fill", alignText: "center", mt: 4 }),
    box({ w: "fill", h: 32 }),                          // 원본 subtitle marginBottom 32
    input(S.login.email),
    input(S.login.password),
    row({ name: "loginBtn", w: "fill", py: 14, bg: "#16a34a", radius: 10, justify: "center", mt: 4 }, [
      txt("로그인", { size: 16, weight: 700, color: "#ffffff" }),
    ]),
    // 원본 hint — 2줄, 가운데 정렬
    txt("데모 계정: investor@farmfi.test / operator@farmfi.test", {
      size: 12, line: 18, color: "#9ca3af", w: "fill", alignText: "center", mt: 24,
    }),
    txt("비밀번호: farmfi123", {
      size: 12, line: 18, color: "#9ca3af", w: "fill", alignText: "center",
    }),
  ]);
}

// ─────────────────────────── 화면 목록 ───────────────────────────

var SCREENS = [
  { key: "store", build: storeScreen },
  { key: "assignment", build: assignmentScreen },
  { key: "growth", build: growthScreen },
  { key: "inventory", build: inventoryScreen },
  { key: "monitoring", build: monitoringScreen },
  { key: "sales", build: salesScreen },
  { key: "home", build: homeScreen },
  { key: "login", build: loginScreen },
];

// figma-svg/gen.js 는 require, figma-plugin/code.js 는 단일 파일 병합으로 쓴다.
// 병합 시엔 위 const 들이 그대로 최상위 스코프에 남아 렌더러가 직접 참조한다.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { C: C, FRAME_W: FRAME_W, SCREENS: SCREENS };
}
