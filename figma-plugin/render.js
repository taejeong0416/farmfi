// 공유 화면 트리(../figma-common/screens.js) → Figma 노드.
// 오토레이아웃(HORIZONTAL/VERTICAL)과 편집 가능한 TextNode 로 만들기 때문에
// SVG 드래그본과 달리 프레임을 늘리면 내부가 따라 재배치된다.
//
// 이 파일은 단독 실행되지 않는다. build.js 가 icons.js + screens.js + 이 파일을
// 한 덩어리로 이어 붙여 code.js 를 만든다.

// ── 색 ──
function hexToRgb(h) {
  h = h.replace("#", "");
  if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}
function solid(h, opacity) {
  return [{ type: "SOLID", color: hexToRgb(h), opacity: opacity == null ? 1 : opacity }];
}

// ── 폰트: 한글 지원 폰트 우선, 없으면 Inter 폴백 ──
var FONT = null;
async function loadFonts() {
  var avail = await figma.listAvailableFontsAsync();
  var byFam = {};
  avail.forEach(function (f) {
    (byFam[f.fontName.family] = byFam[f.fontName.family] || []).push(f.fontName.style);
  });
  var prefs = [
    "Pretendard", "Noto Sans KR", "Noto Sans CJK KR",
    "Apple SD Gothic Neo", "Spoqa Han Sans Neo", "Malgun Gothic", "Inter",
  ];
  var family = prefs.filter(function (p) { return byFam[p]; })[0] || "Inter";
  var styles = byFam[family] || ["Regular"];
  var pick = function (cands) {
    var hit = cands.filter(function (c) { return styles.indexOf(c) >= 0; })[0];
    return hit || styles[0];
  };
  var reg = { family: family, style: pick(["Regular", "Normal"]) };
  var med = { family: family, style: pick(["Medium", "Regular"]) };
  var semi = { family: family, style: pick(["SemiBold", "Semi Bold", "DemiBold", "Medium", "Regular"]) };
  var bold = { family: family, style: pick(["Bold", "Heavy", "ExtraBold", "SemiBold", "Regular"]) };
  var light = { family: family, style: pick(["Light", "Thin", "Regular"]) };

  var uniq = {};
  [reg, med, semi, bold, light].forEach(function (f) { uniq[f.family + "|" + f.style] = f; });
  await Promise.all(Object.keys(uniq).map(function (k) { return figma.loadFontAsync(uniq[k]); }));
  FONT = { reg: reg, med: med, semi: semi, bold: bold, light: light, family: family };
}
function fontFor(weight) {
  if (weight >= 700) return FONT.bold;
  if (weight >= 600) return FONT.semi;
  if (weight >= 500) return FONT.med;
  if (weight <= 300) return FONT.light;
  return FONT.reg;
}

// ── 크기 지정: 부모가 오토레이아웃일 때만 FILL 을 쓸 수 있다 ──
function applySize(node, n) {
  var p = node.parent;
  var inAL = p && "layoutMode" in p && p.layoutMode !== "NONE";

  if (n.w === "fill" && inAL) node.layoutSizingHorizontal = "FILL";
  else if (typeof n.w === "number") {
    if (inAL) node.layoutSizingHorizontal = "FIXED";
    node.resize(n.w, node.height);
  }

  if (n.h === "fill" && inAL) node.layoutSizingVertical = "FILL";
  else if (typeof n.h === "number") {
    if (inAL) node.layoutSizingVertical = "FIXED";
    node.resize(node.width, n.h);
  }
}

var JUSTIFY = { between: "SPACE_BETWEEN", center: "CENTER", end: "MAX" };
var ALIGN = { center: "CENTER", end: "MAX" };

function padOf(n) {
  var all = n.p || 0;
  return {
    t: n.pt != null ? n.pt : n.py != null ? n.py : all,
    b: n.pb != null ? n.pb : n.py != null ? n.py : all,
    l: n.pl != null ? n.pl : n.px != null ? n.px : all,
    r: n.pr != null ? n.pr : n.px != null ? n.px : all,
  };
}

// ── 프레임(col/row/none) ──
function buildFrame(parent, n) {
  var f = figma.createFrame();
  parent.appendChild(f);
  f.name = n.name || (n.dir === "row" ? "Row" : n.dir === "col" ? "Col" : "Stack");
  f.clipsContent = !!n.clip;

  if (n.dir === "none") {
    f.layoutMode = "NONE";
  } else {
    f.layoutMode = n.dir === "row" ? "HORIZONTAL" : "VERTICAL";
    f.itemSpacing = n.gap || 0;
    var p = padOf(n);
    f.paddingTop = p.t; f.paddingBottom = p.b;
    f.paddingLeft = p.l; f.paddingRight = p.r;
    f.primaryAxisSizingMode = "AUTO";
    f.counterAxisSizingMode = "AUTO";
    if (n.justify && JUSTIFY[n.justify]) f.primaryAxisAlignItems = JUSTIFY[n.justify];
    if (n.align && ALIGN[n.align]) f.counterAxisAlignItems = ALIGN[n.align];
  }

  f.fills = n.bg ? solid(n.bg, n.bgOpacity) : [];
  if (n.stroke) {
    f.strokes = solid(n.stroke, n.strokeOpacity);
    f.strokeWeight = n.strokeW || 1;
  }
  // 아래쪽만 있는 구분선 (원본 borderBottomWidth)
  if (n.borderBottom) {
    f.strokes = solid(n.borderBottom);
    f.strokeTopWeight = 0; f.strokeLeftWeight = 0; f.strokeRightWeight = 0;
    f.strokeBottomWeight = 1;
  }
  if (n.radius != null) f.cornerRadius = n.radius;

  applySize(f, n);
  if (n.rotation) f.rotation = -n.rotation;   // Figma 는 반시계 방향이 +

  // 앱 에셋 이미지 — 캐시에 있으면 이미지 채움, 없으면 라벨 박스로 떨어진다.
  if (n._image && applyImageFill(f, n)) return f;

  if (n._placeholder) {
    f.layoutMode = "VERTICAL";
    f.primaryAxisAlignItems = "CENTER";
    f.counterAxisAlignItems = "CENTER";
    f.primaryAxisSizingMode = "FIXED";
    f.counterAxisSizingMode = "FIXED";
    var size = Math.max(6, Math.min(11, Math.round(Math.min(f.width, f.height) * 0.16)));
    buildText(f, { text: n._placeholder, size: size, color: "#656863" });
  }
  return f;
}

// ── 앱 에셋 이미지 ──
// ASSETS 는 build.js 가 figma-common/assets-cache.json 을 인라인해 넣는다.
// 키는 "<에셋>|<폭>|<높이>|<fit>" — 래스터 노드의 w/h 는 모두 숫자라 SVG 쪽과 같다.
var imageHashes = {};

function applyImageFill(frame, n) {
  if (typeof ASSETS === "undefined") return false;
  var key =
    n._image.asset + "|" + Math.round(n.w) + "|" + Math.round(n.h) + "|" + (n._image.fit || "cover");
  var uri = ASSETS[key];
  if (!uri) return false;

  var hash = imageHashes[key];
  if (!hash) {
    var b64 = uri.slice(uri.indexOf(",") + 1);
    hash = figma.createImage(figma.base64Decode(b64)).hash;
    imageHashes[key] = hash;
  }
  frame.fills = [
    {
      type: "IMAGE",
      // 이미지를 표시 크기로 미리 줄여뒀으므로 FILL/FIT 이 원본 contentFit 과 같다.
      scaleMode: n._image.fit === "contain" ? "FIT" : "FILL",
      imageHash: hash,
    },
  ];
  return true;
}

// ── 텍스트 ──
function buildText(parent, n) {
  var t = figma.createText();
  parent.appendChild(t);
  t.name = n.text.length > 24 ? n.text.slice(0, 24) + "…" : n.text;
  t.fontName = fontFor(n.weight || 400);
  t.characters = n.text;
  t.fontSize = n.size || 14;
  if (n.spacing != null) t.letterSpacing = { unit: "PIXELS", value: n.spacing };
  if (n.line != null) t.lineHeight = { unit: "PIXELS", value: n.line };
  t.fills = solid(n.color || "#1d1e1c");
  if (n.alignText === "center") t.textAlignHorizontal = "CENTER";
  else if (n.alignText === "right") t.textAlignHorizontal = "RIGHT";

  var p = t.parent;
  var inAL = p && "layoutMode" in p && p.layoutMode !== "NONE";
  if (n.w === "fill" && inAL) {
    t.textAutoResize = "HEIGHT";
    t.layoutSizingHorizontal = "FILL";
  } else if (typeof n.w === "number") {
    t.textAutoResize = "HEIGHT";
    if (inAL) t.layoutSizingHorizontal = "FIXED";
    t.resize(n.w, t.height);
  } else {
    t.textAutoResize = "WIDTH_AND_HEIGHT";
  }
  // 원본 numberOfLines={1} — 넘치면 말줄임
  if (n.maxLines === 1) {
    t.maxLines = 1;
    t.textTruncation = "ENDING";
  }
  return t;
}

// ── 벡터(아이콘·차트) ──
function buildSvg(parent, n) {
  var markup =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + n._vbW + '" height="' + n._vbH +
    '" viewBox="0 0 ' + n._vbW + " " + n._vbH + '">' + n._svg + "</svg>";
  var v = figma.createNodeFromSvg(markup);
  parent.appendChild(v);
  v.name = n.name || "vector";
  v.fills = [];

  // createNodeFromSvg 는 viewBox 크기로 나온다. resize 는 프레임만 늘리고 안의
  // 벡터는 그대로 두므로 rescale 로 내용까지 함께 키운다.
  // (트리의 svg 노드는 모두 종횡비를 유지하므로 배율 하나로 충분하다.)
  var scale = n.w / n._vbW;
  if (Math.abs(scale - 1) > 0.001) v.rescale(scale);

  var p = v.parent;
  if (p && "layoutMode" in p && p.layoutMode !== "NONE") {
    v.layoutSizingHorizontal = "FIXED";
    v.layoutSizingVertical = "FIXED";
  }
  return v;
}

// ── 트리 순회 ──
function buildNode(parent, n) {
  if (n.dir === "text") return buildText(parent, n);
  if (n.dir === "svg") return buildSvg(parent, n);

  var f = buildFrame(parent, n);
  var kids = n.children || [];
  var inAL = f.layoutMode !== "NONE";

  kids.forEach(function (c) {
    // Figma 오토레이아웃엔 자식 마진이 없다 → 빈 프레임으로 간격을 만든다.
    if (inAL && (c.mt || c.ml)) {
      var gapSize = f.layoutMode === "VERTICAL" ? c.mt || 0 : c.ml || 0;
      if (gapSize > 0) addSpacer(f, gapSize, f.layoutMode);
    }
    var child = buildNode(f, c);
    if (!inAL) {
      // 절대배치 — Figma 의 x/y 는 부모 프레임 좌상단 기준이다.
      child.x = c.absL || 0;
      child.y = c.absT || 0;
    }
    if (inAL && c.mb) addSpacer(f, c.mb, f.layoutMode);
  });

  // 자리표시자는 위에서 라벨을 이미 넣었으므로 자식이 없다.
  return f;
}

function addSpacer(parent, size, mode) {
  var s = figma.createFrame();
  parent.appendChild(s);
  s.name = "spacer";
  s.fills = [];
  s.layoutMode = "NONE";
  if (mode === "VERTICAL") {
    s.resize(1, size);
    s.layoutSizingHorizontal = "FILL";
    s.layoutSizingVertical = "FIXED";
  } else {
    s.resize(size, 1);
    s.layoutSizingHorizontal = "FIXED";
    s.layoutSizingVertical = "FIXED";
  }
  return s;
}

// ── 실행 ──
async function main() {
  await loadFonts();

  // 이미 내용이 있는 페이지에 넣어도 겹치지 않도록, 기존 요소들의 오른쪽에서 시작한다.
  // (프레임을 만들면 곧바로 페이지에 붙으므로 목록을 미리 찍어둬야 한다.)
  var before = figma.currentPage.children.slice();
  var made = [];
  var x = 0;
  if (before.length) {
    x = before.reduce(function (right, n) {
      return Math.max(right, n.x + n.width);
    }, -Infinity) + 120;
  }

  for (var i = 0; i < SCREENS.length; i++) {
    var tree = SCREENS[i].build();
    var frame = buildNode(figma.currentPage, tree);
    frame.x = x;
    frame.y = 0;
    x += frame.width + 80;      // 캔버스에 가로로 나열
    made.push(frame);
  }

  figma.currentPage.selection = made;
  figma.viewport.scrollAndZoomIntoView(made);
  return made.length;
}

main()
  .then(function (count) {
    figma.closePlugin(count + "개 화면 생성 완료 (폰트: " + (FONT ? FONT.family : "?") + ")");
  })
  .catch(function (e) {
    figma.closePlugin("오류: " + (e && e.message ? e.message : String(e)));
  });
