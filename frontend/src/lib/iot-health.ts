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

// ── 마일스톤 게이트용: 새싹삼 도메인 정상범위 (절대 기준) ──────────────────
// 가동률(uptime)은 "최근 분포 대비 튀었나"(상대)가 아니라 "도메인상 건강한가"(절대)로
// 판정해야 한다. Z-score는 판정 윈도우 자체에서 평균을 뽑으므로 지속성 고장
// (예: 히터 고장으로 60일 내내 35℃)을 새 '정상'으로 흡수해 못 잡는 맹점이 있다.
// 따라서 게이트는 아래 절대범위로 판정한다.
//
// 근거 (새싹삼/인삼 재배):
//  - temperature 18~28℃ : 생육가능 12~28, 권장 18~25, 25℃↑ 환풍 (진로교육원·RDA)
//  - humidity    70~90%  : 새싹 수경 70~90, 재배동 내부 82~88
//  - phLevel     5.5~6.5 : 인삼 토양 적정 pH 5.5~6.5 (농진청/RDA)
//  - lightIntensity 0~20000 lux : 반음지, 목표 ~12,000 lux·14h 광주기. 야간 0은
//    정상이라 상한만 게이트(과조도 차단). '주간 암흑' 고장은 시간대 인지가 필요 →
//    향후 확장.
//  - co2Level    400~1500 ppm : 일반 시설재배 범위(대기 ~400, 가온시설 ~1200).
//    새싹삼 전용 출처가 없어 보수적으로 둔 참고값.
export const HEALTHY_RANGES: Record<keyof IoTReading, [number, number]> = {
  temperature: [18, 28],
  humidity: [70, 90],
  co2Level: [400, 1500],
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

// 가동률 = 윈도우 내 정상 가동 비율(%). 데이터 없으면 0 (fail-closed).
export function uptimeRate(readings: IoTReading[]): number {
  if (readings.length === 0) return 0;
  const healthy = readings.filter(isHealthy).length;
  return (healthy / readings.length) * 100;
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
