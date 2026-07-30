// 텍스트 폭 실측 — 추정 대신 실제 폰트 메트릭을 쓴다.
//
// gen.js 의 레이아웃은 글자 폭에 좌우된다(가운데 정렬, 줄바꿈 위치, 말줄임 여부).
// 글자 종류별 평균 비율로 어림하면 한글 문장에서 수십 px 씩 틀어지므로,
// 헤드리스 Chrome 의 canvas measureText 로 실측해 metrics.json 에 캐시한다.
//
//   node measure.js          → 8화면에 쓰이는 모든 문자열 실측 후 metrics.json 갱신
//
// gen.js 는 이 캐시를 읽고, 없는 문자열은 근사식으로 떨어진 뒤 경고한다.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const { SCREENS } = require("../figma-common/screens.js");
const { FONT_STACK, collectTextRuns } = require("./layout.js");

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

function findChrome() {
  const hit = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!hit) {
    console.error(
      "Chrome/Edge 를 찾지 못했습니다. 설치 경로를 measure.js 의 CHROME_CANDIDATES 에 추가하세요."
    );
    process.exit(1);
  }
  return hit;
}

// 화면 트리 전체에서 (문자열, 크기, 굵기, 자간) 조합을 모은다.
const runs = new Map();
for (const screen of SCREENS) {
  collectTextRuns(screen.build(), (run) => {
    runs.set(JSON.stringify(run), run);
  });
}
const list = [...runs.values()];
console.log(`실측 대상 ${list.length}개 문자열 (${SCREENS.length}화면)`);

// 측정 페이지 — 각 조합의 폭을 canvas 로 재서 JSON 으로 뱉는다.
const measurePage = `<!doctype html><meta charset="utf-8">
<body><script>
const RUNS = ${JSON.stringify(list)};
const FONT_STACK = ${JSON.stringify(FONT_STACK)};
const ctx = document.createElement("canvas").getContext("2d");
const out = {};
for (const r of RUNS) {
  ctx.font = r.weight + " " + r.size + "px " + FONT_STACK;
  let w = ctx.measureText(r.text).width;
  // letter-spacing 은 canvas font 에 없으므로 글자 수만큼 더한다(마지막 글자 뒤는 제외).
  if (r.spacing) w += r.spacing * Math.max(0, [...r.text].length - 1);
  out[r.text + "|" + r.size + "|" + r.weight + "|" + (r.spacing || 0)] = Math.round(w * 100) / 100;
}
// 실제로 어떤 폰트가 쓰였는지도 남긴다.
const probe = document.createElement("span");
probe.style.font = "16px " + FONT_STACK;
probe.textContent = "한글Ag";
document.body.appendChild(probe);
document.title = "FARMFI_METRICS:" + JSON.stringify({
  metrics: out,
  fontStack: FONT_STACK,
});
</script></body>`;

const tmp = path.join(os.tmpdir(), "farmfi-measure-" + process.pid + ".html");
fs.writeFileSync(tmp, measurePage, "utf8");

const chrome = findChrome();
console.log(`측정 브라우저: ${path.basename(chrome)}`);

// --dump-dom 은 title 을 포함한 최종 DOM 을 뱉는다.
let dom;
try {
  dom = execFileSync(
    chrome,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--virtual-time-budget=4000",
      "--dump-dom",
      "file:///" + tmp.replace(/\\/g, "/"),
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
} finally {
  fs.unlinkSync(tmp);
}

const marker = dom.match(/FARMFI_METRICS:(\{[\s\S]*?\})<\/title>/);
if (!marker) {
  console.error("측정 결과를 읽지 못했습니다 (title 마커 없음).");
  process.exit(1);
}
const parsed = JSON.parse(
  marker[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
);

const outPath = path.join(__dirname, "metrics.json");
fs.writeFileSync(outPath, JSON.stringify(parsed.metrics, null, 0) + "\n");
console.log(`metrics.json 갱신 — ${Object.keys(parsed.metrics).length}개 항목`);
console.log("이어서 `node gen.js` 를 실행하면 실측 폭으로 다시 뽑습니다.");
