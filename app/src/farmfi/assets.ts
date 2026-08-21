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

// ── 픽셀 아이콘 (2026-08-13, 256x256 투명 PNG) ──
// icons.tsx 의 SVG 글리프로 표현이 애매한 것(센서 계측·설비·파일형식)만 비트맵으로 둔다.
export const PIXEL_ICON = {
  "sensor-temp": require("../../assets/farmfi/icons/sensor-temp.png"),
  "sensor-humidity": require("../../assets/farmfi/icons/sensor-humidity.png"),
  "sensor-co2": require("../../assets/farmfi/icons/sensor-co2.png"),
  "sensor-ec": require("../../assets/farmfi/icons/sensor-ec.png"),
  "device-led": require("../../assets/farmfi/icons/device-led.png"),
  "device-fan": require("../../assets/farmfi/icons/device-fan.png"),
  "device-pump": require("../../assets/farmfi/icons/device-pump.png"),
  "file-csv": require("../../assets/farmfi/icons/file-csv.png"),
  "file-xlsx": require("../../assets/farmfi/icons/file-xlsx.png"),
  "file-pdf": require("../../assets/farmfi/icons/file-pdf.png"),
  "ui-warning": require("../../assets/farmfi/icons/ui-warning.png"),
  "ui-bell": require("../../assets/farmfi/icons/ui-bell.png"),
  "ui-download": require("../../assets/farmfi/icons/ui-download.png"),
  "ui-alert": require("../../assets/farmfi/icons/ui-alert.png"),
  "ui-box": require("../../assets/farmfi/icons/ui-box.png"),
  "ui-calendar": require("../../assets/farmfi/icons/ui-calendar.png"),
  // 마일스톤 스테이지 상태 (M-13). 벡터 자물쇠·체크는 픽셀 에셋들과 겉돌아 교체.
  "stage-locked": require("../../assets/farmfi/icons/stage-locked.png"),
  "stage-active": require("../../assets/farmfi/icons/stage-active.png"),
  "stage-done": require("../../assets/farmfi/icons/stage-done.png"),
  // 증빙 종류 (M-13). 계약서·영수증이 같은 벡터 아이콘을 쓰고 있어 구분이 안 됐다.
  "evidence-contract": require("../../assets/farmfi/icons/evidence-contract.png"),
  "evidence-receipt": require("../../assets/farmfi/icons/evidence-receipt.png"),
  "evidence-photo": require("../../assets/farmfi/icons/evidence-photo.png"),
  "evidence-sensor": require("../../assets/farmfi/icons/evidence-sensor.png"),
  // 단계 통과 축하 (M-13 완료 화면). 512px — 아이콘이 아니라 삽화 크기다.
  "stage-cleared": require("../../assets/farmfi/icons/stage-cleared.png"),
} as const;

export type PixelIconName = keyof typeof PIXEL_ICON;
