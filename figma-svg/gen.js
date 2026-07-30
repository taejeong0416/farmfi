// FarmFi 앱 화면 → SVG 생성기 (피그마 웹 드래그용)
// 화면 정의는 ../figma-common/screens.js 가 유일한 출처다. 이 파일은 그 트리를
// 간이 flex 레이아웃으로 굳혀 SVG 로 직렬화한다.
// 좌표는 절대값이 되지만 그룹(<g>) 구조와 편집 가능한 <text> 는 유지된다.
//
//   node gen.js          → 8개 화면 전부
//   node gen.js store    → 지정한 화면만

const fs = require("fs");
const path = require("path");

const { C, FRAME_W, SCREENS } = require("../figma-common/screens.js");

const FONT_STACK =
  "Pretendard, 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

// ─────────────────── 텍스트 폭 근사 ───────────────────
// 실제 폰트 메트릭이 없으므로 글자 종류별 평균 비율로 잡는다.
function charFactor(ch) {
  const code = ch.codePointAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return 1.0; // 한글 완성형
  if (code >= 0x1100 && code <= 0x11ff) return 1.0; // 한글 자모
  if (code >= 0x3000 && code <= 0x30ff) return 1.0; // CJK 기호/가나
  if (code >= 0xff00 && code <= 0xffef) return 1.0; // 전각
  if (/[0-9]/.test(ch)) return 0.56;
  if (ch === " ") return 0.3;
  if (/[A-Z]/.test(ch)) return 0.64;
  return 0.52;
}
function measureText(s, size, spacing) {
  spacing = spacing || 0;
  let w = 0;
  for (const ch of [...s]) w += size * charFactor(ch) + spacing;
  return Math.ceil(w);
}

// 줄바꿈 단위로 쪼갠다 — 라틴은 단어, CJK 는 글자 단위로 끊긴다.
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

function wrapText(s, size, spacing, maxW) {
  const lines = [];
  let line = "";
  for (const seg of segments(s)) {
    const next = line + seg;
    if (line && measureText(next.trimEnd(), size, spacing) > maxW) {
      lines.push(line.trimEnd());
      line = seg === " " ? "" : seg;
    } else {
      line = next;
    }
  }
  if (line.trimEnd()) lines.push(line.trimEnd());
  return lines.length ? lines : [""];
}

// 1줄 말줄임 (원본 numberOfLines={1})
function truncate(s, size, spacing, maxW) {
  if (measureText(s, size, spacing) <= maxW) return s;
  const chars = [...s];
  while (chars.length > 1) {
    chars.pop();
    if (measureText(chars.join("") + "…", size, spacing) <= maxW) break;
  }
  return chars.join("") + "…";
}

// ─────────────────── 레이아웃 엔진 ───────────────────
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

// 1) 내재 크기(hug 기준) 측정
function measure(n) {
  if (n.dir === "text") {
    const size = n.size || 14;
    const line = n.line || Math.round(size * 1.32);
    if (n.wrap && typeof n.w === "number") {
      n._lines = wrapText(n.text, size, n.spacing || 0, n.w);
    } else if (n.maxLines === 1 && typeof n.w === "number") {
      n._lines = [truncate(n.text, size, n.spacing || 0, n.w)];
    } else {
      n._lines = [n.text];
    }
    n._iw = typeof n.w === "number" ? n.w : measureText(n.text, size, n.spacing || 0);
    n._ih = n._lines.length * line;
    n._line = line;
    return;
  }
  n.children.forEach(measure);
  const p = pad(n);
  const gap = n.gap || 0;
  const kids = n.children;

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
    // dir "none" — 크기는 스스로 정한다(절대배치 자식은 크기에 기여하지 않음).
    n._iw = typeof n.w === "number" ? n.w : 0;
    n._ih = typeof n.h === "number" ? n.h : 0;
  }
  if (typeof n.w === "number") n._iw = n.w;
  if (typeof n.h === "number") n._ih = n.h;
}

// 주축 여유분의 시작 오프셋 (justify)
function mainOffset(justify, extra) {
  if (justify === "center") return extra / 2;
  if (justify === "end") return extra;
  return 0;
}

// 2) 확정 크기 배분(fill) + 위치 지정
function place(n, x, y, availW, availH) {
  n._x = x;
  n._y = y;
  n._w = n.w === "fill" ? availW : typeof n.w === "number" ? n.w : n._iw;
  n._h = n.h === "fill" ? availH : typeof n.h === "number" ? n.h : n._ih;
  if (n.dir === "text" || n.dir === "svg") return;

  const p = pad(n);
  const gap = n.gap || 0;
  const innerX = n._x + p.l;
  const innerY = n._y + p.t;
  const innerW = n._w - p.l - p.r;
  const innerH = n._h - p.t - p.b;
  const kids = n.children;

  if (n.dir === "none") {
    // 절대배치 — absL/absT 는 이 노드의 좌상단 기준
    kids.forEach((c) => {
      const cw = c.w === "fill" ? n._w : typeof c.w === "number" ? c.w : c._iw;
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
    kids.forEach((c, i) => {
      cx += c.ml || 0;
      const cw = c.w === "fill" ? per : typeof c.w === "number" ? c.w : c._iw;
      const ch = c.h === "fill" ? innerH : typeof c.h === "number" ? c.h : c._ih;
      let cy = innerY + (c.mt || 0);
      if (n.align === "center") cy = innerY + (innerH - ch) / 2;
      else if (n.align === "end") cy = innerY + (innerH - ch);
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

// ─────────────────── SVG 직렬화 ───────────────────
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const r2 = (v) => Math.round(v * 100) / 100;
const fontWeight = (w) => (w >= 700 ? 700 : w >= 600 ? 600 : w >= 500 ? 500 : 400);

function emit(n, out) {
  const rot = n.rotation
    ? ` transform="rotate(${n.rotation} ${r2(n._x + n._w / 2)} ${r2(n._y + n._h / 2)})"`
    : "";

  if (n.bg || n.stroke) {
    const attrs = [
      `x="${r2(n._x)}"`, `y="${r2(n._y)}"`,
      `width="${r2(n._w)}"`, `height="${r2(n._h)}"`,
    ];
    if (n.radius) attrs.push(`rx="${n.radius}"`);
    attrs.push(`fill="${n.bg || "none"}"`);
    if (n.bg && n.bgOpacity != null) attrs.push(`fill-opacity="${n.bgOpacity}"`);
    if (n.stroke) {
      attrs.push(`stroke="${n.stroke}"`, `stroke-width="${n.strokeW || 1}"`);
      if (n.strokeOpacity != null) attrs.push(`stroke-opacity="${n.strokeOpacity}"`);
    }
    out.push(`<rect ${attrs.join(" ")}${rot}/>`);
  }

  // 아래쪽 구분선만 있는 행 (원본 borderBottomWidth)
  if (n.borderBottom) {
    out.push(
      `<line x1="${r2(n._x)}" y1="${r2(n._y + n._h)}" x2="${r2(n._x + n._w)}" ` +
        `y2="${r2(n._y + n._h)}" stroke="${n.borderBottom}" stroke-width="1"/>`
    );
  }

  if (n.dir === "svg") {
    const sx = n._w / n._vbW;
    const sy = n._h / n._vbH;
    out.push(
      `<g transform="translate(${r2(n._x)} ${r2(n._y)}) scale(${r2(sx)} ${r2(sy)})">${n._svg}</g>`
    );
  }

  if (n._placeholder) {
    // 래스터 PNG 자리표시자 — 라벨만 가운데 넣는다.
    const fs2 = Math.max(6, Math.min(11, Math.round(Math.min(n._w, n._h) * 0.16)));
    out.push(
      `<text x="${r2(n._x + n._w / 2)}" y="${r2(n._y + n._h / 2 + fs2 * 0.35)}" ` +
        `font-family="${FONT_STACK}" font-size="${fs2}" fill="${C.muted}" ` +
        `text-anchor="middle">${esc(n._placeholder)}</text>`
    );
  }

  if (n.dir === "text") {
    const size = n.size || 14;
    const anchor = n.alignText === "center" ? "middle" : n.alignText === "right" ? "end" : "start";
    const tx = n.alignText === "center" ? n._x + n._w / 2 : n.alignText === "right" ? n._x + n._w : n._x;
    const ls = n.spacing ? ` letter-spacing="${n.spacing}"` : "";
    n._lines.forEach((lineText, i) => {
      const baseline = n._y + i * n._line + (n._line + size) / 2 - size * 0.18;
      out.push(
        `<text x="${r2(tx)}" y="${r2(baseline)}" font-family="${FONT_STACK}" ` +
          `font-size="${size}" font-weight="${fontWeight(n.weight || 400)}" ` +
          `fill="${n.color || C.ink}" text-anchor="${anchor}"${ls}>${esc(lineText)}</text>`
      );
    });
  }

  if (n.clip) {
    // 원본이 스크롤 영역이라 넘친 만큼 잘라야 하는 노드
    const id = "clip" + ++clipSeq;
    out.push(
      `<clipPath id="${id}"><rect x="${r2(n._x)}" y="${r2(n._y)}" ` +
        `width="${r2(n._w)}" height="${r2(n._h)}"/></clipPath>`
    );
    out.push(`<g clip-path="url(#${id})">`);
    n.children.forEach((c) => emit(c, out));
    out.push("</g>");
  } else {
    n.children.forEach((c) => emit(c, out));
  }
}

let clipSeq = 0;

function render(tree, name) {
  clipSeq = 0;
  measure(tree);
  place(tree, 0, 0, tree._iw, tree._ih);
  const out = [];
  emit(tree, out);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${r2(tree._w)}" height="${r2(tree._h)}" ` +
    `viewBox="0 0 ${r2(tree._w)} ${r2(tree._h)}" font-family="${FONT_STACK}">\n` +
    out.join("\n") +
    "\n</svg>\n";
  fs.writeFileSync(path.join(__dirname, name + ".svg"), svg);
  console.log(`${name}.svg  (${r2(tree._w)} × ${r2(tree._h)})`);
}

const only = process.argv.slice(2);
const targets = only.length ? SCREENS.filter((s) => only.includes(s.key)) : SCREENS;
if (!targets.length) {
  console.error(`화면 이름이 없습니다. 가능한 값: ${SCREENS.map((s) => s.key).join(", ")}`);
  process.exit(1);
}
targets.forEach((s) => render(s.build(), s.key));
console.log(`\n${targets.length}개 화면 생성 완료 (프레임 폭 ${FRAME_W})`);
