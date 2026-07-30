// 간이 flex 레이아웃 엔진 — 화면 트리를 절대좌표로 굳힌다.
// gen.js(SVG 출력)와 measure.js(폭 실측)가 공유한다.
//
// 글자 폭은 metrics.json(헤드리스 Chrome 실측)을 우선 쓰고, 없으면 근사식으로
// 떨어진다. 근사식만 쓰면 한글 문장에서 수십 px 씩 틀어져 가운데 정렬·줄바꿈
// 위치·말줄임 여부가 실제와 달라진다.

const fs = require("fs");
const path = require("path");

const FONT_STACK =
  "Pretendard, 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

// ─────────────────── 글자 폭 ───────────────────
let METRICS = {};
let metricsLoaded = false;
const missing = new Set();

function loadMetrics() {
  if (metricsLoaded) return;
  metricsLoaded = true;
  const p = path.join(__dirname, "metrics.json");
  if (fs.existsSync(p)) {
    try {
      METRICS = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (e) {
      console.warn(`metrics.json 을 읽지 못했습니다 (${e.message}) — 근사식으로 진행합니다.`);
    }
  }
}

function normWeight(w) {
  w = w || 400;
  return w >= 700 ? 700 : w >= 600 ? 600 : w >= 500 ? 500 : w <= 300 ? 300 : 400;
}
function metricKey(text, size, weight, spacing) {
  return text + "|" + size + "|" + normWeight(weight) + "|" + (spacing || 0);
}

// 근사식 — 실측값이 없을 때만 쓴다.
function charFactor(ch) {
  const code = ch.codePointAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return 0.82; // 한글 완성형
  if (code >= 0x1100 && code <= 0x11ff) return 0.82; // 한글 자모
  if (code >= 0x3000 && code <= 0x30ff) return 0.9; // CJK 기호/가나
  if (code >= 0xff00 && code <= 0xffef) return 0.9; // 전각
  if (/[0-9]/.test(ch)) return 0.55;
  if (ch === " ") return 0.27;
  if (/[A-Z]/.test(ch)) return 0.63;
  return 0.5;
}
function estimate(s, size, spacing) {
  let w = 0;
  for (const ch of [...s]) w += size * charFactor(ch);
  if (spacing) w += spacing * Math.max(0, [...s].length - 1);
  return w;
}

function textWidth(s, size, weight, spacing) {
  loadMetrics();
  const hit = METRICS[metricKey(s, size, weight, spacing)];
  if (hit != null) return hit;
  if (s.trim()) missing.add(metricKey(s, size, weight, spacing));
  return estimate(s, size, spacing);
}

function missingMetrics() {
  return [...missing];
}

// ─────────────────── 줄바꿈 단위 ───────────────────
// 라틴은 단어, CJK 는 글자 단위로 끊긴다.
function segments(s) {
  const out = [];
  let latin = "";
  for (const ch of [...s]) {
    const code = ch.codePointAt(0);
    const cjk =
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0x3000 && code <= 0x30ff) ||
      (code >= 0xff00 && code <= 0xffef);
    if (cjk || ch === " ") {
      if (latin) { out.push(latin); latin = ""; }
      out.push(ch);
    } else {
      latin += ch;
    }
  }
  if (latin) out.push(latin);
  return out;
}

function wrapText(s, size, weight, spacing, maxW) {
  const lines = [];
  let line = "";
  let lineW = 0;
  for (const seg of segments(s)) {
    const segW = textWidth(seg, size, weight, spacing);
    if (line && lineW + segW > maxW) {
      lines.push(line.replace(/\s+$/, ""));
      if (seg === " ") { line = ""; lineW = 0; }
      else { line = seg; lineW = segW; }
    } else {
      line += seg;
      lineW += segW;
    }
  }
  if (line.replace(/\s+$/, "")) lines.push(line.replace(/\s+$/, ""));
  return lines.length ? lines : [""];
}

// 1줄 말줄임 (원본 numberOfLines={1})
function truncateText(s, size, weight, spacing, maxW) {
  if (textWidth(s, size, weight, spacing) <= maxW) return s;
  const ell = textWidth("…", size, weight, spacing);
  const segs = segments(s);
  let out = "";
  let w = 0;
  for (const seg of segs) {
    const segW = textWidth(seg, size, weight, spacing);
    if (w + segW + ell > maxW) break;
    out += seg;
    w += segW;
  }
  return (out || [...s][0] || "") + "…";
}

// ─────────────────── 트리 순회 ───────────────────
function walk(n, fn) {
  fn(n);
  (n.children || []).forEach((c) => walk(c, fn));
}

// 실측이 필요한 (문자열, 크기, 굵기, 자간) 조합을 모은다.
// 전체 문자열과 줄바꿈 단위(단어·글자)를 모두 넣어야 줄바꿈·말줄임을 계산할 수 있다.
function collectTextRuns(tree, emit) {
  walk(tree, (n) => {
    if (n.dir !== "text") return;
    const size = n.size || 14;
    const weight = normWeight(n.weight);
    const spacing = n.spacing || 0;
    emit({ text: n.text, size, weight, spacing });
    if (n.wrap || n.maxLines === 1) {
      segments(n.text).forEach((seg) => emit({ text: seg, size, weight, spacing }));
      emit({ text: "…", size, weight, spacing });
    }
  });
}

// ─────────────────── 크기 계산 ───────────────────
function pad(n) {
  const all = n.p || 0;
  return {
    t: n.pt != null ? n.pt : n.py != null ? n.py : all,
    b: n.pb != null ? n.pb : n.py != null ? n.py : all,
    l: n.pl != null ? n.pl : n.px != null ? n.px : all,
    r: n.pr != null ? n.pr : n.px != null ? n.px : all,
  };
}
const outerW = (c) => (typeof c.w === "number" ? c.w : c._iw) + (c.ml || 0);
const outerH = (c) => (typeof c.h === "number" ? c.h : c._ih) + (c.mt || 0) + (c.mb || 0);

function measure(n) {
  if (n.dir === "text") {
    const size = n.size || 14;
    const line = n.line || Math.round(size * 1.32);
    const full = textWidth(n.text, size, n.weight, n.spacing);

    if (n.wrap && n._wrapW > 0) {
      n._lines = wrapText(n.text, size, n.weight, n.spacing, n._wrapW);
    } else {
      n._lines = [n.text];
    }
    // 폭: 지정값 → fill 은 나중에 결정 → 그 외엔 내용 폭
    n._iw = typeof n.w === "number" ? n.w : Math.ceil(full);
    n._ih = n._lines.length * line;
    n._line = line;
    return;
  }

  (n.children || []).forEach(measure);
  const p = pad(n);
  const gap = n.gap || 0;
  const kids = n.children || [];

  if (n.dir === "row") {
    const sumW = kids.reduce((a, c) => a + outerW(c), 0) + gap * Math.max(0, kids.length - 1);
    const maxH = kids.reduce((a, c) => Math.max(a, outerH(c)), 0);
    n._iw = p.l + p.r + sumW;
    n._ih = p.t + p.b + maxH;
  } else if (n.dir === "col") {
    const sumH = kids.reduce((a, c) => a + outerH(c), 0) + gap * Math.max(0, kids.length - 1);
    const maxW = kids.reduce((a, c) => Math.max(a, outerW(c)), 0);
    n._iw = p.l + p.r + maxW;
    n._ih = p.t + p.b + sumH;
  } else {
    // dir "none" — 절대배치 자식은 크기에 기여하지 않는다.
    n._iw = typeof n.w === "number" ? n.w : 0;
    n._ih = typeof n.h === "number" ? n.h : 0;
  }
  if (typeof n.w === "number") n._iw = n.w;
  if (typeof n.h === "number") n._ih = n.h;
}

// 노드 상단에서 첫 줄 베이스라인까지의 거리. 텍스트가 아니면 하단을 베이스라인으로 본다.
function baselineOffset(n) {
  if (n.dir === "text") {
    const size = n.size || 14;
    const line = n.line || Math.round(size * 1.32);
    return (line + size) / 2 - size * 0.18;
  }
  return typeof n.h === "number" ? n.h : n._ih || 0;
}

function mainOffset(justify, extra) {
  if (justify === "center") return extra / 2;
  if (justify === "end") return extra;
  return 0;
}

function place(n, x, y, availW, availH) {
  n._x = x;
  n._y = y;
  // wPct 는 부모가 이미 비율을 곱해 availW 로 넘긴다 → fill 과 같이 받는다.
  n._w =
    n.w === "fill" || n.wPct != null ? availW
    : typeof n.w === "number" ? n.w
    : n._iw;
  n._h = n.h === "fill" ? availH : typeof n.h === "number" ? n.h : n._ih;
  if (n.dir === "text" || n.dir === "svg") return;

  const p = pad(n);
  const gap = n.gap || 0;
  const innerX = n._x + p.l;
  const innerY = n._y + p.t;
  const innerW = n._w - p.l - p.r;
  const innerH = n._h - p.t - p.b;
  const kids = n.children || [];

  if (n.dir === "none") {
    kids.forEach((c) => {
      // wPct — 부모 폭의 비율 (원본의 width: "NN%" 막대 채움)
      const cw =
        c.wPct != null ? n._w * c.wPct
        : c.w === "fill" ? n._w
        : typeof c.w === "number" ? c.w
        : c._iw;
      const ch = c.h === "fill" ? n._h : typeof c.h === "number" ? c.h : c._ih;
      place(c, n._x + (c.absL || 0), n._y + (c.absT || 0), cw, ch);
    });
    return;
  }

  if (n.dir === "row") {
    const fills = kids.filter((c) => c.w === "fill");
    const fixedW =
      kids.reduce((a, c) => a + (c.w === "fill" ? c.ml || 0 : outerW(c)), 0) +
      gap * Math.max(0, kids.length - 1);
    const extra = Math.max(0, innerW - fixedW);
    const per = fills.length ? extra / fills.length : 0;

    let cx = innerX;
    let between = 0;
    if (!fills.length) {
      if (n.justify === "between" && kids.length > 1) between = extra / (kids.length - 1);
      else cx += mainOffset(n.justify, extra);
    }
    // baseline — 원본의 중첩 <Text>(값 + 작은 단위)는 같은 베이스라인을 쓴다.
    const baseShift = n.align === "baseline" ? Math.max(...kids.map(baselineOffset)) : 0;

    kids.forEach((c, i) => {
      cx += c.ml || 0;
      const cw = c.w === "fill" ? per : typeof c.w === "number" ? c.w : c._iw;
      const ch = c.h === "fill" ? innerH : typeof c.h === "number" ? c.h : c._ih;
      let cy = innerY + (c.mt || 0);
      if (n.align === "center") cy = innerY + (innerH - ch) / 2;
      else if (n.align === "end") cy = innerY + (innerH - ch);
      else if (n.align === "baseline") cy = innerY + baseShift - baselineOffset(c);
      place(c, cx, cy, cw, ch);
      cx += cw + gap + (i < kids.length - 1 ? between : 0);
    });
  } else if (n.dir === "col") {
    const fills = kids.filter((c) => c.h === "fill");
    const fixedH =
      kids.reduce((a, c) => a + (c.h === "fill" ? (c.mt || 0) + (c.mb || 0) : outerH(c)), 0) +
      gap * Math.max(0, kids.length - 1);
    const extra = Math.max(0, innerH - fixedH);
    const per = fills.length ? extra / fills.length : 0;

    let cy = innerY;
    let between = 0;
    if (!fills.length) {
      if (n.justify === "between" && kids.length > 1) between = extra / (kids.length - 1);
      else cy += mainOffset(n.justify, extra);
    }
    kids.forEach((c, i) => {
      cy += c.mt || 0;
      const cw = c.w === "fill" ? innerW : typeof c.w === "number" ? c.w : c._iw;
      const ch = c.h === "fill" ? per : typeof c.h === "number" ? c.h : c._ih;
      let cx = innerX;
      if (n.align === "center") cx = innerX + (innerW - cw) / 2;
      else if (n.align === "end") cx = innerX + (innerW - cw);
      place(c, cx, cy, cw, ch);
      cy += ch + (c.mb || 0) + gap + (i < kids.length - 1 ? between : 0);
    });
  }
}

// 2패스 레이아웃.
// 줄바꿈 폭은 부모가 정하므로 한 번 배치해 폭을 확정한 뒤, 그 폭으로 줄을 나누고
// 바뀐 높이를 반영해 다시 배치한다. 말줄임은 높이를 바꾸지 않으므로 마지막에 한다.
function layout(tree) {
  measure(tree);
  place(tree, 0, 0, tree._iw, tree._ih);

  let needsSecondPass = false;
  walk(tree, (n) => {
    if (n.dir === "text" && n.wrap) {
      const w = Math.floor(n._w);
      if (w > 0 && n._wrapW !== w) { n._wrapW = w; needsSecondPass = true; }
    }
  });

  if (needsSecondPass) {
    measure(tree);
    place(tree, 0, 0, tree._iw, tree._ih);
  }

  // 1줄 말줄임 — 확정된 폭 기준
  walk(tree, (n) => {
    if (n.dir === "text" && n.maxLines === 1) {
      n._lines = [truncateText(n.text, n.size || 14, n.weight, n.spacing, Math.floor(n._w))];
    }
  });

  return tree;
}

module.exports = {
  FONT_STACK,
  layout,
  collectTextRuns,
  textWidth,
  missingMetrics,
  normWeight,
};
