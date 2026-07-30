// 앱 에셋 → 표시 크기로 줄인 data URI 캐시 (assets-cache.json)
//
// 원본 PNG 는 0.5~2.3MB 라 그대로는 못 심는다. 화면에서 실제로 쓰이는 크기로
// 줄이면 장당 수십 KB 로 떨어지므로 SVG·플러그인에 그대로 넣을 수 있다.
// 재배 랙 씬은 베이스 이미지 + 식물 스프라이트를 앱과 같은 슬롯 규칙으로 합성한다.
//
//   node build-assets.js
//
// 축소·합성은 헤드리스 Chrome 의 canvas 로 한다(Node 에 이미지 처리 의존성 없음).

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const { SCREENS } = require("../figma-common/screens.js");
const SPEC = require("../figma-common/assets-spec.js");
const { layout } = require("./layout.js");

const REPO = path.resolve(__dirname, "..");
const ASSET_DIR = path.join(REPO, SPEC.ASSET_DIR);

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
    console.error("Chrome/Edge 를 찾지 못했습니다. CHROME_CANDIDATES 에 경로를 추가하세요.");
    process.exit(1);
  }
  return hit;
}

// ── 1. 화면을 배치해 필요한 (에셋, 표시크기) 조합을 모은다 ──
const requests = new Map();
function collect(n) {
  if (n._image && n._image.asset) {
    const w = Math.max(1, Math.round(n._w));
    const h = Math.max(1, Math.round(n._h));
    const key = `${n._image.asset}|${w}|${h}|${n._image.fit || "cover"}`;
    if (!requests.has(key)) {
      requests.set(key, { asset: n._image.asset, w, h, fit: n._image.fit || "cover" });
    }
  }
  (n.children || []).forEach(collect);
}
for (const s of SCREENS) collect(layout(s.build()));

const list = [...requests.entries()].map(([key, r]) => ({ key, ...r }));
if (!list.length) {
  console.log("필요한 이미지가 없습니다.");
  process.exit(0);
}
console.log(`합성 대상 ${list.length}개 (에셋 × 표시크기 조합)`);

// 원본 파일 존재 확인
const missingFiles = Object.entries(SPEC.FILES).filter(
  ([, f]) => !fs.existsSync(path.join(ASSET_DIR, f))
);
if (missingFiles.length) {
  console.error("원본 PNG 를 찾지 못했습니다:");
  missingFiles.forEach(([k, f]) => console.error(`  ${k}: ${path.join(ASSET_DIR, f)}`));
  process.exit(1);
}

// ── 2. 브라우저에서 합성 ──
const fileUrl = (p) => "file:///" + p.replace(/\\/g, "/").replace(/ /g, "%20");
const fileUrls = {};
for (const [k, f] of Object.entries(SPEC.FILES)) {
  fileUrls[k] = fileUrl(path.join(ASSET_DIR, f));
}

const page = `<!doctype html><meta charset="utf-8"><body>
<script>
const REQS = ${JSON.stringify(list)};
const URLS = ${JSON.stringify(fileUrls)};
const CROP_CELL = ${JSON.stringify(SPEC.CROP_CELL)};
const PLANT_FILE = ${JSON.stringify(SPEC.PLANT_FILE)};
const SLOTS = { leafy: ${JSON.stringify(SPEC.LEAFY_SLOTS)}, tomato: ${JSON.stringify(SPEC.TOMATO_SLOTS)} };
const STAGE_SCALE = { butter: 0.95, romaine: 0.87, basil: 0.84, tomato: 0.9 };

function parseKey(key) {
  const p = String(key).split(":");
  if (p[0] === "rack") return { type: "rack", kind: p[1], maturity: +p[2], compact: p[3] === "compact" };
  if (p[0] === "crop") return { type: "crop", kind: p[1] };
  if (p[0] === "plant") return { type: "plant", kind: p[1] };
  if (p[0] === "plain") return { type: "plain", file: p[1] };
  return null;
}
function plantLayout(kind, index, maturity, compact) {
  const isTomato = kind === "tomato";
  const slots = isTomato ? SLOTS.tomato : SLOTS.leafy;
  const slot = slots[index % slots.length];
  const stageScale = STAGE_SCALE[kind] != null ? STAGE_SCALE[kind] : 0.9;
  const maturityScale = 0.86 + (maturity / 100) * 0.14;
  const scaleMul = compact ? (isTomato ? 0.5 : 0.48) : 1;
  return {
    file: PLANT_FILE[kind],
    slotX: slot.x / 100, slotY: slot.y / 100,
    baseW: isTomato ? 80 : 52, baseH: isTomato ? 112 : 58,
    translateY: isTomato ? 9 : 5,
    scale: stageScale * maturityScale * (0.96 + (index % 3) * 0.025) * scaleMul,
    rotate: isTomato ? -0.8 : -1.1,
    count: slots.length,
  };
}

const cache = {};
function load(url) {
  return new Promise((res, rej) => {
    if (cache[url]) return res(cache[url]);
    const img = new Image();
    img.onload = () => { cache[url] = img; res(img); };
    img.onerror = () => rej(new Error("load fail " + url));
    img.src = url;
  });
}

// object-fit: cover 로 그리기
function drawCover(ctx, img, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}
// object-fit: contain + 아래 정렬 (원본 contentFit=contain, contentPosition=bottom)
function drawContainBottom(ctx, img, w, h) {
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, (w - dw) / 2, h - dh, dw, dh);
}

async function build(req) {
  const spec = parseKey(req.asset);
  const cv = document.createElement("canvas");
  cv.width = req.w; cv.height = req.h;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (spec.type === "plain") {
    const img = await load(URLS[spec.file]);
    if (req.fit === "contain") drawContainBottom(ctx, img, req.w, req.h);
    else drawCover(ctx, img, req.w, req.h);

  } else if (spec.type === "crop") {
    // 스프라이트 3열×2행에서 해당 셀만 잘라 넣는다.
    const img = await load(URLS.cropSprite);
    const cell = CROP_CELL[spec.kind] || CROP_CELL.romaine;
    const cw = img.width / 3, ch = img.height / 2;
    ctx.drawImage(img, cell.col * cw, cell.row * ch, cw, ch, 0, 0, req.w, req.h);

  } else if (spec.type === "plant") {
    const img = await load(URLS[PLANT_FILE[spec.kind] || "plantRomaine"]);
    drawContainBottom(ctx, img, req.w, req.h);

  } else if (spec.type === "rack") {
    // 베드 베이스(cover) 위에 식물을 슬롯마다 얹는다 — 앱 GrowthRackScene 과 같은 규칙.
    const isTomato = spec.kind === "tomato";
    const base = await load(isTomato ? URLS.rackTomato : URLS.rackLeafy);
    ctx.fillStyle = "#f4f3ef";
    ctx.fillRect(0, 0, req.w, req.h);
    drawCover(ctx, base, req.w, req.h);

    const plant = await load(URLS[PLANT_FILE[spec.kind] || "plantRomaine"]);
    const n = plantLayout(spec.kind, 0, spec.maturity, spec.compact).count;
    for (let i = 0; i < n; i++) {
      const L = plantLayout(spec.kind, i, spec.maturity, spec.compact);
      // 컨테이너: left slotX%, top slotY%, marginLeft -baseW/2, marginTop -baseH
      const boxL = req.w * L.slotX - L.baseW / 2;
      const boxT = req.h * L.slotY - L.baseH;
      ctx.save();
      // transformOrigin 50% 100% → 박스 하단 중앙
      const ox = boxL + L.baseW / 2;
      const oy = boxT + L.baseH;
      ctx.translate(ox, oy + L.translateY);
      ctx.rotate((L.rotate * Math.PI) / 180);
      ctx.scale(L.scale, L.scale);
      ctx.translate(-L.baseW / 2, -L.baseH);
      // contain + bottom 정렬로 박스에 맞춘다
      const s = Math.min(L.baseW / plant.width, L.baseH / plant.height);
      const dw = plant.width * s, dh = plant.height * s;
      ctx.drawImage(plant, (L.baseW - dw) / 2, L.baseH - dh, dw, dh);
      ctx.restore();
    }
  }
  return cv.toDataURL("image/png");
}

(async () => {
  const out = {};
  const errors = [];
  for (const req of REQS) {
    try { out[req.key] = await build(req); }
    catch (e) { errors.push(req.key + ": " + e.message); }
  }
  const el = document.createElement("script");
  el.type = "application/json";
  el.id = "farmfi-assets";
  el.textContent = JSON.stringify({ assets: out, errors });
  document.body.appendChild(el);
  document.title = "FARMFI_ASSETS_DONE";
})();
</script></body>`;

const tmp = path.join(os.tmpdir(), "farmfi-assets-" + process.pid + ".html");
fs.writeFileSync(tmp, page, "utf8");

const chrome = findChrome();
console.log(`합성 브라우저: ${path.basename(chrome)}`);

let dom;
try {
  dom = execFileSync(
    chrome,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--allow-file-access-from-files", // file:// 이미지를 canvas 로 읽기 위해 필요
      "--virtual-time-budget=60000",
      "--dump-dom",
      fileUrl(tmp),
    ],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }
  );
} finally {
  fs.unlinkSync(tmp);
}

const m = dom.match(
  /<script type="application\/json" id="farmfi-assets">([\s\S]*?)<\/script>/
);
if (!m) {
  console.error("합성 결과를 읽지 못했습니다. Chrome 이 캔버스를 읽지 못했을 수 있습니다.");
  process.exit(1);
}
const parsed = JSON.parse(m[1]);
if (parsed.errors.length) {
  console.warn(`실패 ${parsed.errors.length}건:`);
  parsed.errors.slice(0, 8).forEach((e) => console.warn("  " + e));
}

const outPath = path.join(__dirname, "..", "figma-common", "assets-cache.json");
fs.writeFileSync(outPath, JSON.stringify(parsed.assets));
const total = Object.values(parsed.assets).reduce((a, v) => a + v.length, 0);
console.log(
  `figma-common/assets-cache.json 생성 — ${Object.keys(parsed.assets).length}개, ${(total / 1024 / 1024).toFixed(2)}MB`
);
console.log("이어서 `node gen.js` 를 실행하면 실제 이미지가 들어갑니다.");
