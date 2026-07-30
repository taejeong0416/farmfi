// code.js 빌드 — 피그마 플러그인은 manifest 의 main 파일 하나만 읽고 require 가
// 없으므로, 공유 정의와 렌더러를 순서대로 이어 붙인다.
//
//   node build.js
//
// 붙이는 순서에 의미가 있다:
//   icons.js   → iconBody() 정의
//   screens.js → 그 iconBody 로 화면 트리(SCREENS) 구성
//   render.js  → SCREENS 를 Figma 노드로 만들고 실행

const fs = require("fs");
const path = require("path");

const PARTS = [
  ["../figma-common/icons.js", "공유: 아이콘 path"],
  ["../figma-common/screens.js", "공유: 화면 정의"],
  ["./render.js", "플러그인: Figma 렌더러"],
];

// 표시 크기로 줄인 앱 에셋(figma-svg/build-assets.js 생성물)을 인라인한다.
// 플러그인은 파일을 읽을 수 없으므로 code.js 안에 들어가야 한다.
function assetsChunk() {
  const p = path.join(__dirname, "..", "figma-common", "assets-cache.json");
  if (!fs.existsSync(p)) {
    console.warn(
      "figma-common/assets-cache.json 이 없습니다 — 이미지 없이 자리표시자로 만들어집니다.\n" +
        "  이미지를 넣으려면: cd ../figma-svg && node build-assets.js"
    );
    return "var ASSETS = {};";
  }
  const json = fs.readFileSync(p, "utf8");
  return "var ASSETS = " + json + ";";
}

const chunks = [
  "// ⚠ 자동 생성 파일 — 직접 고치지 말 것.",
  "//    화면을 바꾸려면 ../figma-common/screens.js 를,",
  "//    렌더링을 바꾸려면 ./render.js 를 고친 뒤 `node build.js` 를 다시 실행한다.",
  "",
];

chunks.push(
  "// ".padEnd(74, "═"),
  "// 공유: 앱 에셋 (표시 크기로 축소·합성된 PNG)",
  "//    출처: figma-common/assets-cache.json  ←  figma-svg/build-assets.js",
  "// ".padEnd(74, "═"),
  assetsChunk(),
  ""
);

for (const [rel, label] of PARTS) {
  const abs = path.join(__dirname, rel);
  let src = fs.readFileSync(abs, "utf8");
  // Node 전용 내보내기 구문은 플러그인 샌드박스에서 쓰이지 않으므로 떼어낸다.
  src = src.replace(
    /if \(typeof module !== "undefined" && module\.exports\) \{[\s\S]*?\n\}\n?/g,
    ""
  );
  chunks.push(
    "// ".padEnd(74, "═"),
    `// ${label}  (출처: ${rel})`,
    "// ".padEnd(74, "═"),
    src.trimEnd(),
    ""
  );
}

const out = chunks.join("\n") + "\n";
fs.writeFileSync(path.join(__dirname, "code.js"), out);

const lines = out.split("\n").length;
console.log(`code.js 생성 완료 — ${lines}줄, ${(out.length / 1024).toFixed(1)}KB`);
