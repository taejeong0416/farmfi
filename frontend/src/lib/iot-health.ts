import { faultRanges, DEFAULT_CROP } from "./crop-profiles";

export interface IoTReading {
  temperature: number;
  humidity: number;
  co2Level: number;
  lightIntensity: number;
  phLevel: number;
}

export interface AnomalyResult {
  anomalyScore: number;
  isAnomaly: boolean;
  affectedSensors: string[];
}

const SENSOR_KEYS: (keyof IoTReading)[] = [
  "temperature",
  "humidity",
  "co2Level",
  "lightIntensity",
  "phLevel",
];

// ── 설비 고장 판정용: 절대 게이트 ──────────────────────────────────────────
// 이상 알림은 "최근 분포 대비 튀었나"(상대, Z-score)만으로는 부족하다. Z-score는
// 판정 윈도우에서 평균을 뽑으므로 지속성 고장(예: 히터 고장으로 내내 35℃)을 새
// '정상'으로 흡수해 못 잡는 맹점이 있어, 아래 절대범위로도 판정한다.
//
// 범위 자체는 crop-profiles의 농학 최적대에서 파생된다(faultRanges) — 판정 기준이
// 두 벌 존재하면 최적화 화면과 모니터링 화면이 같은 데이터에 다른 답을 내기 때문.
// 가동률(마일스톤 IoT 게이트)은 "설비가 살아 있었나"를 재는 지표라 최적대가 아니라
// 넓은 고장 게이트를 쓴다. 최적대 이탈은 growth-monitoring이 별도 등급으로 다룬다.
// (근거: MDPI Agriculture 2016/575, IIETA RIA 38-03 — 수직농장 상추 환경/수확량)
export const HEALTHY_RANGES: Record<keyof IoTReading, [number, number]> =
  faultRanges(DEFAULT_CROP);

// 모든 센서가 고장 게이트 안이면 "정상 가동" 1건.
export function isHealthy(
  reading: IoTReading,
  cropKey?: string
): boolean {
  const ranges = cropKey ? faultRanges(cropKey) : HEALTHY_RANGES;
  return SENSOR_KEYS.every((key) => {
    const [lo, hi] = ranges[key];
    return reading[key] >= lo && reading[key] <= hi;
  });
}

// ── 대시보드용: 단발 이상치(스파이크) 탐지 ─────────────────────────────────
// 게이트와 별개로 "방금 이상신호가 떴나"를 보여주는 보조 신호.
// 윈도우 평균 대비 Z-score > 3σ 인 센서를 이상으로 표시한다(상대 판정).
const Z_THRESHOLD = 3;

export function detectAnomalies(data: IoTReading[]): AnomalyResult[] {
  if (data.length === 0) return [];

  // Compute mean and stdDev for each sensor
  const stats = SENSOR_KEYS.map((key) => {
    const values = data.map((d) => d[key]);
    const n = values.length;
    const mean = values.reduce((s, v) => s + v, 0) / n;
    const variance =
      values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    return { key, mean, stdDev };
  });

  return data.map((reading) => {
    const zScores = stats.map(({ key, mean, stdDev }) => ({
      key,
      z: stdDev !== 0 ? Math.abs(reading[key] - mean) / stdDev : 0,
    }));

    const anomalyScore = Math.max(...zScores.map((s) => s.z));
    const affectedSensors = zScores
      .filter((s) => s.z > Z_THRESHOLD)
      .map((s) => s.key);

    return {
      anomalyScore,
      isAnomaly: anomalyScore > Z_THRESHOLD,
      affectedSensors,
    };
  });
}
