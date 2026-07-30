// 앱 에셋 명세 — 어떤 PNG 를 어떻게 합성/크롭해야 앱 화면과 같아지는지.
// app/src/farmfi/{assets.ts, data.ts, components.tsx} 의 상수를 그대로 옮긴다.
// figma-svg/build-assets.js 가 이 명세대로 Chrome 캔버스에서 합성한다.

var ASSET_DIR = "app/assets/farmfi";

var FILES = {
  cropSprite: "storage-crop-icons-v2.png",
  plantButter: "crop-butterhead-stage-v1.png",
  plantRomaine: "crop-romaine-stage-v1.png",
  plantBasil: "crop-basil-stage-v1.png",
  plantTomato: "crop-tomato-stage-v1.png",
  rackLeafy: "growth-rack-empty-v2.png",
  rackTomato: "growth-rack-tomato-empty-v2.png",
  tomatoBed: "tomato-bed-topdown-v1.png",
  operator: "operator-portrait-v2.png",
  floorPlan: "store-floor-plan-v1.png",
};

// 스프라이트(3열×2행) 내 작물 셀 (app/src/farmfi/data.ts CROP_CELL)
var CROP_CELL = {
  butter: { col: 0, row: 0 },
  romaine: { col: 1, row: 0 },
  basil: { col: 2, row: 0 },
  tomato: { col: 0, row: 1 },
};

var PLANT_FILE = {
  butter: "plantButter",
  romaine: "plantRomaine",
  basil: "plantBasil",
  tomato: "plantTomato",
};

// 재배 베드 슬롯 위치 (%) — app/src/farmfi/data.ts
var LEAFY_SLOTS = [];
[29.5, 52.7, 76.3].forEach(function (y) {
  [29, 40.5, 52, 63.5, 75].forEach(function (x) { LEAFY_SLOTS.push({ x: x, y: y }); });
});
var TOMATO_SLOTS = [];
[44.1, 78.6].forEach(function (y) {
  [29, 43.5, 58, 72.5].forEach(function (x) { TOMATO_SLOTS.push({ x: x, y: y }); });
});

// 식물 1개의 배치 — app/src/farmfi/components.tsx RackPlant
// 애니메이션은 시작 각도(정지 상태)로 굳힌다.
var STAGE_SCALE = { butter: 0.95, romaine: 0.87, basil: 0.84, tomato: 0.9 };

function plantLayout(kind, index, maturity, compact) {
  var isTomato = kind === "tomato";
  var slots = isTomato ? TOMATO_SLOTS : LEAFY_SLOTS;
  var slot = slots[index % slots.length];
  var stageScale = STAGE_SCALE[kind] != null ? STAGE_SCALE[kind] : 0.9;
  var maturityScale = 0.86 + (maturity / 100) * 0.14;
  var scaleMul = compact ? (isTomato ? 0.5 : 0.48) : 1;
  return {
    file: PLANT_FILE[kind],
    slotX: slot.x / 100,
    slotY: slot.y / 100,
    baseW: isTomato ? 80 : 52,
    baseH: isTomato ? 112 : 58,
    translateY: isTomato ? 9 : 5,
    scale: stageScale * maturityScale * (0.96 + (index % 3) * 0.025) * scaleMul,
    rotate: isTomato ? -0.8 : -1.1,
  };
}

function rackSlotCount(kind) {
  return kind === "tomato" ? TOMATO_SLOTS.length : LEAFY_SLOTS.length;
}

// ── 에셋 키 파싱 ──
// "rack:<kind>:<maturity>:<compact|full>"  재배 랙 씬 (베이스 + 식물 합성)
// "crop:<kind>"                            작물 스프라이트 셀 크롭
// "plant:<kind>"                           식물 단일 이미지 (MiniRackPlant)
// "plain:<fileKey>"                        원본 그대로 (운영자 사진·평면도·토마토 베드)
function parseAssetKey(key) {
  var parts = String(key).split(":");
  if (parts[0] === "rack") {
    return {
      type: "rack",
      kind: parts[1],
      maturity: Number(parts[2]),
      compact: parts[3] === "compact",
    };
  }
  if (parts[0] === "crop") return { type: "crop", kind: parts[1] };
  if (parts[0] === "plant") return { type: "plant", kind: parts[1] };
  if (parts[0] === "plain") return { type: "plain", file: parts[1] };
  return null;
}

var SPEC = {
  ASSET_DIR: ASSET_DIR,
  FILES: FILES,
  CROP_CELL: CROP_CELL,
  PLANT_FILE: PLANT_FILE,
  LEAFY_SLOTS: LEAFY_SLOTS,
  TOMATO_SLOTS: TOMATO_SLOTS,
  plantLayout: plantLayout,
  rackSlotCount: rackSlotCount,
  parseAssetKey: parseAssetKey,
};

if (typeof module !== "undefined" && module.exports) module.exports = SPEC;
