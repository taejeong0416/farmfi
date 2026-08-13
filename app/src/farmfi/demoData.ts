// ⚠️ 데모 전용 목데이터 — 백엔드 엔드포인트가 아직 없는 화면만 이 파일을 쓴다.
//
// data.ts 에는 넣지 않는다. 그쪽은 "API 실패 시 화면이 조용히 거짓을 말하지 않게"
// 목데이터를 비워둔 파일이고, 그 규칙을 깨면 안 된다. 여기 값을 쓰는 화면은 반드시
// DemoBadge 를 띄워 실데이터가 아님을 사용자에게 알린다.
//
// 실 API 가 붙는 대로 해당 상수를 여기서 지우고 화면을 useApiResource 로 옮긴다.
// 남아 있는 상수 = 남은 미연동 작업량. `grep -rn demoData src/` 로 추적한다.
import type { CropKind, RackId } from "./data";
import type { Severity } from "./theme";
import type { PixelIconName } from "./assets";

export type { Severity };

export const BRANCHES = ["부산대 1호점", "연산 2호점", "수영 3호점"];

export const RACK_DATA: Record<
  RackId,
  { crop: string; kind: CropKind; state: string; stage: string; maturity: number; humidity: number }
> = {
  A: { crop: "버터헤드", kind: "butter", state: "정상", stage: "수확기", maturity: 92, humidity: 92 },
  B: { crop: "로메인", kind: "romaine", state: "정상", stage: "성장기", maturity: 75, humidity: 88 },
  C: { crop: "바질", kind: "basil", state: "정상", stage: "성장기", maturity: 68, humidity: 84 },
  D: { crop: "방울토마토", kind: "tomato", state: "관찰", stage: "착과기", maturity: 72, humidity: 78 },
};

export const STORE_DATA: Array<{ name: string; harvest: number; beds: number; rack: RackId }> = [
  { name: "부산대 1호점", harvest: 38, beds: 4, rack: "A" },
  { name: "연산 2호점", harvest: 24, beds: 4, rack: "B" },
  { name: "수영 3호점", harvest: 31, beds: 4, rack: "C" },
];

export const STOCK_ROWS: Array<{ kind: CropKind; name: string; stock: number; value: number }> = [
  { kind: "butter", name: "버터헤드", stock: 12, value: 68 },
  { kind: "romaine", name: "로메인", stock: 8, value: 53 },
  { kind: "basil", name: "바질", stock: 6, value: 40 },
  { kind: "tomato", name: "방울토마토", stock: 4, value: 31 },
];

export const LINKED_BEDS: Array<{
  rack: RackId;
  kind: CropKind;
  crop: string;
  maturity: number;
  harvest: string;
  yield: number;
}> = [
  { rack: "A", kind: "butter", crop: "버터헤드", maturity: 92, harvest: "2일 후", yield: 14 },
  { rack: "B", kind: "romaine", crop: "로메인", maturity: 75, harvest: "4일 후", yield: 10 },
  { rack: "C", kind: "basil", crop: "바질", maturity: 68, harvest: "6일 후", yield: 12 },
  { rack: "D", kind: "tomato", crop: "방울토마토", maturity: 45, harvest: "9일 후", yield: 8 },
];

export const SALES_RANKING: Array<{ kind: CropKind; name: string; count: number; value: number }> = [
  { kind: "butter", name: "버터헤드", count: 520, value: 100 },
  { kind: "romaine", name: "로메인", count: 320, value: 67 },
  { kind: "basil", name: "바질", count: 240, value: 51 },
  { kind: "tomato", name: "방울토마토", count: 200, value: 40 },
];

export const SALES_HISTORY = [
  ["07.16", "버터헤드", "2팩", "18,000원"],
  ["07.16", "로메인", "1팩", "8,500원"],
  ["07.15", "바질", "1팩", "6,000원"],
];

export const CHART_VALUES = [52, 102, 82, 128, 102, 82, 102, 103, 151, 127, 169, 103, 153, 104, 151];

export type Alert = {
  id: string;
  rack: RackId;
  device: string;
  message: string;
  severity: Severity;
  at: string;
  ack: boolean;
};

export const ALERTS: Alert[] = [
  { id: "AL-241", rack: "D", device: "환기팬", message: "CO₂ 농도가 상한 임계값을 15분 이상 초과했습니다.", severity: "critical", at: "08.13 14:22", ack: false },
  { id: "AL-240", rack: "C", device: "관수 펌프", message: "습도가 하한 임계값 아래로 내려갔습니다.", severity: "warning", at: "08.13 11:05", ack: false },
  { id: "AL-238", rack: "B", device: "LED 조명", message: "점등 스케줄이 20분 지연되어 실행됐습니다.", severity: "warning", at: "08.13 06:40", ack: true },
  { id: "AL-235", rack: "A", device: "순환팬", message: "정기 점검이 완료됐습니다.", severity: "normal", at: "08.12 18:10", ack: true },
];

export type GrowthLog = { id: string; rack: RackId; at: string; stage: string; note: string; author: string };

export const GROWTH_LOGS: GrowthLog[] = [
  { id: "GL-92", rack: "A", at: "08.13 09:10", stage: "수확기", note: "잎 색 균일, 수확 적기 도달", author: "운영자 1" },
  { id: "GL-88", rack: "A", at: "08.10 09:00", stage: "결구기", note: "결구 시작, 관수 주기 유지", author: "운영자 1" },
  { id: "GL-81", rack: "A", at: "08.05 08:50", stage: "성장기", note: "본엽 6매 전개", author: "운영자 2" },
  { id: "GL-70", rack: "B", at: "08.12 09:20", stage: "성장기", note: "생육 균일, 이상 없음", author: "운영자 1" },
  { id: "GL-64", rack: "C", at: "08.11 10:00", stage: "성장기", note: "일부 개체 도장 경향, 광량 조정 필요", author: "운영자 2" },
  { id: "GL-58", rack: "D", at: "08.13 08:30", stage: "착과기", note: "1화방 착과 확인", author: "운영자 1" },
];

export type ScheduleStatus = "planned" | "growing" | "done";

export type Schedule = {
  id: string;
  rack: RackId;
  crop: string;
  kind: CropKind;
  sownAt: string;
  harvestAt: string;
  status: ScheduleStatus;
};

export const SCHEDULE_STATUS_LABEL: Record<ScheduleStatus, string> = {
  planned: "예정",
  growing: "재배 중",
  done: "완료",
};

export const SCHEDULES: Schedule[] = [
  { id: "SC-31", rack: "A", crop: "버터헤드", kind: "butter", sownAt: "2026-07-04", harvestAt: "2026-08-15", status: "growing" },
  { id: "SC-32", rack: "B", crop: "로메인", kind: "romaine", sownAt: "2026-07-18", harvestAt: "2026-08-27", status: "growing" },
  { id: "SC-33", rack: "C", crop: "바질", kind: "basil", sownAt: "2026-07-25", harvestAt: "2026-09-02", status: "growing" },
  { id: "SC-34", rack: "D", crop: "방울토마토", kind: "tomato", sownAt: "2026-06-20", harvestAt: "2026-09-10", status: "growing" },
  { id: "SC-35", rack: "A", crop: "버터헤드", kind: "butter", sownAt: "2026-08-20", harvestAt: "2026-09-30", status: "planned" },
];

export type SensorKey = "temp" | "humidity" | "co2" | "ec";

export const SENSOR_META: Record<SensorKey, { label: string; unit: string; icon: PixelIconName }> = {
  temp: { label: "온도", unit: "℃", icon: "sensor-temp" },
  humidity: { label: "습도", unit: "%", icon: "sensor-humidity" },
  co2: { label: "CO₂", unit: "ppm", icon: "sensor-co2" },
  ec: { label: "EC", unit: "dS/m", icon: "sensor-ec" },
};

export type Device = { key: string; name: string; on: boolean; controllable: boolean; icon: PixelIconName };

export const BED_SENSORS: Record<RackId, { readings: Record<SensorKey, number>; updatedAt: string; devices: Device[] }> = {
  A: {
    readings: { temp: 22.4, humidity: 92, co2: 780, ec: 1.8 },
    updatedAt: "08.13 14:35",
    devices: [
      { key: "led", name: "LED 조명", on: true, controllable: true, icon: "device-led" },
      { key: "fan", name: "순환팬", on: true, controllable: true, icon: "device-fan" },
      { key: "pump", name: "관수 펌프", on: false, controllable: true, icon: "device-pump" },
    ],
  },
  B: {
    readings: { temp: 23.1, humidity: 88, co2: 810, ec: 1.6 },
    updatedAt: "08.13 14:35",
    devices: [
      { key: "led", name: "LED 조명", on: true, controllable: true, icon: "device-led" },
      { key: "fan", name: "순환팬", on: false, controllable: true, icon: "device-fan" },
      { key: "pump", name: "관수 펌프", on: false, controllable: true, icon: "device-pump" },
    ],
  },
  C: {
    readings: { temp: 24.0, humidity: 71, co2: 840, ec: 1.5 },
    updatedAt: "08.13 14:31",
    devices: [
      { key: "led", name: "LED 조명", on: true, controllable: true, icon: "device-led" },
      { key: "fan", name: "순환팬", on: true, controllable: true, icon: "device-fan" },
      { key: "pump", name: "관수 펌프", on: true, controllable: false, icon: "device-pump" },
    ],
  },
  D: {
    readings: { temp: 25.6, humidity: 78, co2: 1240, ec: 2.1 },
    updatedAt: "08.13 14:35",
    devices: [
      { key: "led", name: "LED 조명", on: true, controllable: true, icon: "device-led" },
      { key: "fan", name: "환기팬", on: false, controllable: true, icon: "device-fan" },
      { key: "pump", name: "관수 펌프", on: false, controllable: true, icon: "device-pump" },
    ],
  },
};

export const DEFAULT_THRESHOLDS: Record<SensorKey, { min: number; max: number }> = {
  temp: { min: 18, max: 26 },
  humidity: { min: 60, max: 90 },
  co2: { min: 400, max: 1000 },
  ec: { min: 1.2, max: 2.4 },
};

export const SENSOR_HISTORY: Record<SensorKey, number[]> = {
  temp: [20.1, 19.8, 19.6, 19.5, 19.9, 20.8, 21.6, 22.3, 22.9, 23.4, 23.8, 24.1, 24.3, 24.0, 23.6, 23.1, 22.6, 22.2, 21.8, 21.4, 21.0, 20.7, 20.4, 20.2],
  humidity: [88, 89, 90, 91, 91, 90, 89, 87, 85, 84, 83, 82, 81, 82, 84, 86, 87, 88, 89, 90, 90, 91, 91, 92],
  co2: [520, 505, 498, 495, 510, 560, 640, 720, 800, 870, 930, 990, 1040, 1080, 1120, 1180, 1240, 1190, 1090, 950, 820, 700, 610, 550],
  ec: [1.6, 1.6, 1.6, 1.6, 1.7, 1.7, 1.7, 1.8, 1.8, 1.8, 1.9, 1.9, 1.9, 2.0, 2.0, 2.0, 2.1, 2.0, 2.0, 1.9, 1.9, 1.8, 1.8, 1.7],
};

export type StockMove = { id: string; kind: CropKind; at: string; delta: number; after: number; reason: string; actor: string };

export const STOCK_MOVES: StockMove[] = [
  { id: "SM-410", kind: "butter", at: "08.13 10:20", delta: +14, after: 12, reason: "베드 A 수확 입고", actor: "운영자 1" },
  { id: "SM-409", kind: "butter", at: "08.13 09:05", delta: -6, after: -2, reason: "매장 판매", actor: "POS 연동" },
  { id: "SM-402", kind: "romaine", at: "08.12 17:40", delta: -3, after: 8, reason: "매장 판매", actor: "POS 연동" },
  { id: "SM-398", kind: "basil", at: "08.12 11:10", delta: -2, after: 6, reason: "폐기(잎 손상)", actor: "운영자 2" },
  { id: "SM-390", kind: "tomato", at: "08.11 16:00", delta: +8, after: 4, reason: "베드 D 수확 입고", actor: "운영자 1" },
];

export const STOCK_MIN: Record<CropKind, number> = { butter: 10, romaine: 8, basil: 5, tomato: 6 };

export type Transaction = { id: string; at: string; item: string; kind: CropKind; qty: number; amount: number };

export const TRANSACTIONS: Transaction[] = [
  { id: "TX-1182", at: "08.13 15:12", item: "버터헤드", kind: "butter", qty: 2, amount: 18000 },
  { id: "TX-1181", at: "08.13 14:48", item: "로메인", kind: "romaine", qty: 1, amount: 8500 },
  { id: "TX-1180", at: "08.13 13:30", item: "바질", kind: "basil", qty: 3, amount: 18000 },
  { id: "TX-1179", at: "08.13 12:05", item: "방울토마토", kind: "tomato", qty: 1, amount: 9500 },
  { id: "TX-1178", at: "08.13 11:22", item: "버터헤드", kind: "butter", qty: 4, amount: 36000 },
  { id: "TX-1177", at: "08.12 18:40", item: "로메인", kind: "romaine", qty: 2, amount: 17000 },
];

export type NotifyPref = { key: string; label: string; caption: string; on: boolean };

export const NOTIFY_PREFS: NotifyPref[] = [
  { key: "device_critical", label: "설비 위험 알림", caption: "임계값 초과·설비 정지 등 즉시 조치가 필요한 알림", on: true },
  { key: "device_warning", label: "설비 주의 알림", caption: "임계값 근접·스케줄 지연 등 확인이 필요한 알림", on: true },
  { key: "stock_low", label: "재고 부족 알림", caption: "품목 수량이 부족 기준 이하로 내려갈 때", on: true },
  { key: "harvest", label: "수확 예정 알림", caption: "재배 일정의 수확 예정일 3일 전", on: false },
  { key: "report", label: "주간 리포트", caption: "매주 월요일 지난주 매출·판매 요약", on: false },
];

export const EXPORT_FORMATS = [
  { key: "csv", label: "CSV", caption: "엑셀·구글시트에서 바로 열 수 있는 표 형식", icon: "file-csv" },
  { key: "xlsx", label: "Excel", caption: "서식이 적용된 .xlsx 파일", icon: "file-xlsx" },
  { key: "pdf", label: "PDF", caption: "인쇄·공유용 리포트 문서", icon: "file-pdf" },
] as const;
