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

// ── 생육 이상 판정용: 도메인 정상범위 (절대 기준) ──────────────────────────
// 이상 알림은 "최근 분포 대비 튀었나"(상대, Z-score)만으로는 부족하다. Z-score는
// 판정 윈도우에서 평균을 뽑으므로 지속성 고장(예: 히터 고장으로 내내 35℃)을 새
// '정상'으로 흡수해 못 잡는 맹점이 있어, 아래 절대범위로도 판정한다.
//
// 근거 (실내 수직농장 엽채류/상추 재배 — 수직농장 상추 환경·수확량 연구 문헌 기반):
//  - temperature 18~26℃ : 엽채류 생육 최적 18~24, 26℃↑ 팁번·추대 위험
//  - humidity    55~75%  : 과습 시 병해·저습 시 팁번 — 중간대 유지
//  - phLevel     5.5~6.5 : 수경 양액 적정 pH (상추)
//  - lightIntensity 0~20000 lux : 목표 주간 12,000~15,000 lux. 야간 0은 정상이라
//    상한만 게이트(과조도 차단).
//  - co2Level    800~1400 ppm : 시설 CO2 시비(대기 ~400 → 시비 900~1200).
//    일적산광량과 함께 수확량 변동의 주요인.
// (참고: MDPI Agriculture 2016/575, IIETA RIA 38-03 — 수직농장 상추 환경/수확량)
export const HEALTHY_RANGES: Record<keyof IoTReading, [number, number]> = {
  temperature: [18, 26],
  humidity: [55, 75],
  co2Level: [800, 1400],
  lightIntensity: [0, 20000],
  phLevel: [5.5, 6.5],
};

// 모든 센서가 도메인 정상범위 안이면 "정상 가동" 1건.
export function isHealthy(reading: IoTReading): boolean {
  return SENSOR_KEYS.every((key) => {
    const [lo, hi] = HEALTHY_RANGES[key];
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
