// 픽셀 에셋 정적 매핑 (RN require는 정적 경로만 허용).
// 원본 비율(width/height)은 스프라이트 크롭·배치 계산에 사용.
export const CROP_SPRITE = require("../../assets/farmfi/storage-crop-icons-v2.png");

export const CROP_PLANT = {
  butter: { src: require("../../assets/farmfi/crop-butterhead-stage-v1.png"), w: 1254, h: 1254 },
  romaine: { src: require("../../assets/farmfi/crop-romaine-stage-v1.png"), w: 1254, h: 1254 },
  basil: { src: require("../../assets/farmfi/crop-basil-stage-v1.png"), w: 1254, h: 1254 },
  tomato: { src: require("../../assets/farmfi/crop-tomato-stage-v1.png"), w: 1024, h: 1536 },
} as const;

export const RACK_BASE = {
  leafy: require("../../assets/farmfi/growth-rack-empty-v2.png"),
  tomato: require("../../assets/farmfi/growth-rack-tomato-empty-v2.png"),
};

export const TOMATO_BED = require("../../assets/farmfi/tomato-bed-topdown-v1.png");
export const OPERATOR_PORTRAIT = require("../../assets/farmfi/operator-portrait-v2.png");
export const STORE_FLOOR_PLAN = require("../../assets/farmfi/store-floor-plan-v1.png");
