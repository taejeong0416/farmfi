// assets-cache.json 조회 — build-assets.js 가 만든 축소/합성 이미지를 꺼내 쓴다.
// 캐시가 없으면 null 을 돌려주고, gen.js 는 자리표시자 라벨로 떨어진다.

const fs = require("fs");
const path = require("path");

let CACHE = null;
const missing = new Set();

function load() {
  if (CACHE) return CACHE;
  const p = path.join(__dirname, "..", "figma-common", "assets-cache.json");
  CACHE = {};
  if (fs.existsSync(p)) {
    try {
      CACHE = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (e) {
      console.warn(`figma-common/assets-cache.json 을 읽지 못했습니다 (${e.message}) — 자리표시자로 진행합니다.`);
    }
  }
  return CACHE;
}

function assetDataUri(asset, w, h, fit) {
  const cache = load();
  const key = `${asset}|${w}|${h}|${fit || "cover"}`;
  const hit = cache[key];
  if (hit) return hit;
  missing.add(key);
  return null;
}

function missingAssets() {
  return [...missing];
}

module.exports = { assetDataUri, missingAssets };
