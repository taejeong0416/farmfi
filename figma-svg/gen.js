// FarmFi 앱 화면 → SVG 생성기 (피그마 웹 드래그용)
// 화면 정의는 ../figma-common/screens.js, 레이아웃은 ./layout.js 가 담당한다.
// 이 파일은 배치가 끝난 트리를 SVG 로 직렬화하는 일만 한다.
//
//   node measure.js      → 글자 폭 실측 (metrics.json)  ※ 문구를 바꿨으면 먼저 실행
//   node gen.js          → 8개 화면 전부
//   node gen.js store    → 지정한 화면만

const fs = require("fs");
const path = require("path");

const { C, FRAME_W, SCREENS } = require("../figma-common/screens.js");
const { FONT_STACK, layout, missingMetrics, normWeight } = require("./layout.js");
const { assetDataUri, missingAssets } = require("./assets.js");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const r2 = (v) => Math.round(v * 100) / 100;

let clipSeq = 0;

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

  // 앱 에셋 이미지 — 표시 크기로 줄여 data URI 로 심는다.
  if (n._image) {
    const uri = assetDataUri(n._image.asset, Math.round(n._w), Math.round(n._h), n._image.fit);
    if (uri) {
      const clip = n._image.clipId ? ` clip-path="url(#${n._image.clipId})"` : "";
      // xlink:href 로 쓴다 — SVG2 의 href 만 넣으면 구형 임포터(피그마 포함)가
      // 임베드 이미지를 놓칠 수 있다. 둘 다 넣으면 data URI 가 두 배가 되므로 하나만.
      out.push(
        `<image x="${r2(n._x)}" y="${r2(n._y)}" width="${r2(n._w)}" height="${r2(n._h)}" ` +
          `preserveAspectRatio="${n._image.fit === "contain" ? "xMidYMax meet" : "none"}"${clip} ` +
          `xlink:href="${uri}"/>`
      );
    } else if (n._placeholder) {
      emitPlaceholderLabel(n, out);
    }
  } else if (n._placeholder) {
    emitPlaceholderLabel(n, out);
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
          `font-size="${size}" font-weight="${normWeight(n.weight)}" ` +
          `fill="${n.color || C.ink}" text-anchor="${anchor}"${ls}>${esc(lineText)}</text>`
      );
    });
  }

  const kids = n.children || [];
  if (n.clip) {
    // 원본이 스크롤 영역이라 넘친 만큼 잘라야 하는 노드
    const id = "clip" + ++clipSeq;
    out.push(
      `<clipPath id="${id}"><rect x="${r2(n._x)}" y="${r2(n._y)}" ` +
        `width="${r2(n._w)}" height="${r2(n._h)}"/></clipPath>`
    );
    out.push(`<g clip-path="url(#${id})">`);
    kids.forEach((c) => emit(c, out));
    out.push("</g>");
  } else {
    kids.forEach((c) => emit(c, out));
  }
}

function emitPlaceholderLabel(n, out) {
  const size = Math.max(6, Math.min(11, Math.round(Math.min(n._w, n._h) * 0.16)));
  out.push(
    `<text x="${r2(n._x + n._w / 2)}" y="${r2(n._y + n._h / 2 + size * 0.35)}" ` +
      `font-family="${FONT_STACK}" font-size="${size}" fill="${C.muted}" ` +
      `text-anchor="middle">${esc(n._placeholder)}</text>`
  );
}

function render(screen) {
  clipSeq = 0;
  const tree = layout(screen.build());
  const out = [];
  emit(tree, out);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${r2(tree._w)}" height="${r2(tree._h)}" ` +
    `viewBox="0 0 ${r2(tree._w)} ${r2(tree._h)}" font-family="${FONT_STACK}">\n` +
    out.join("\n") +
    "\n</svg>\n";
  const file = path.join(__dirname, screen.key + ".svg");
  fs.writeFileSync(file, svg);
  const kb = (svg.length / 1024).toFixed(0);
  console.log(`${(screen.key + ".svg").padEnd(18)} ${r2(tree._w)} × ${r2(tree._h)}   ${kb}KB`);
}

const only = process.argv.slice(2);
const targets = only.length ? SCREENS.filter((s) => only.includes(s.key)) : SCREENS;
if (!targets.length) {
  console.error(`화면 이름이 없습니다. 가능한 값: ${SCREENS.map((s) => s.key).join(", ")}`);
  process.exit(1);
}
targets.forEach(render);

const missText = missingMetrics();
const missImg = missingAssets();

if (missText.length) {
  console.warn(
    `\n⚠ 실측값 없는 문자열 ${missText.length}개 — 근사식으로 배치했습니다.\n` +
      `  정확히 맞추려면 \`node measure.js\` 를 실행한 뒤 다시 뽑으세요.\n` +
      missText.slice(0, 5).map((k) => "    " + k.split("|")[0]).join("\n")
  );
}
if (missImg.length) {
  console.warn(
    `\n⚠ 캐시에 없는 이미지 ${missImg.length}개 — 자리표시자 박스로 남겼습니다.\n` +
      `  실제 이미지를 넣으려면 \`node build-assets.js\` 를 실행한 뒤 다시 뽑으세요.\n` +
      missImg.slice(0, 5).map((k) => "    " + k).join("\n")
  );
}
if (!missText.length && !missImg.length) {
  console.log(
    `\n${targets.length}개 화면 생성 완료 — 실측 폰트 폭 + 실제 앱 이미지 (프레임 폭 ${FRAME_W})`
  );
}
