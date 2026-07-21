// ── 실시간 생육 모니터링 분석 합성 ────────────────────────────────────────
// 화면(웹 대시보드·모바일 앱)이 한 번의 호출로 "시계열 + 이상신호"를 얻도록,
// 흩어져 있던 세 탐지기를 하나로 합성한다:
//   ① detectAnomalies  — 윈도우 평균 대비 Z>3σ 스파이크(단발 이상치, 상대판정)
//   ② cusumDrift       — 계절차분+MAD CUSUM 관리도(지속 드리프트, "언제부터")
//   ③ HEALTHY_RANGES   — 새싹삼 도메인 절대범위 위반(설비 고장 게이트)
// 세 신호는 잡는 실패 모드가 달라 상호보완이다(스파이크≠드리프트≠범위이탈).
// 순수 함수 — DB/네트워크 의존 없음. API 라우트와 모바일 앱이 공유한다.

import {
  IoTReading,
  HEALTHY_RANGES,
  detectAnomalies,
  isHealthy,
} from "./iot-health";
import { cusumDrift } from "./optimization";

// 가동률 = 윈도우 내 도메인 정상범위 판독 비율(%). iot-health.uptimeRate가
// 제거돼(팀원 리팩터) isHealthy로 로컬 계산한다.
function uptimeRate(readings: IoTReading[]): number {
  if (readings.length === 0) return 0;
  return (readings.filter(isHealthy).length / readings.length) * 100;
}

export type SensorKey = keyof IoTReading;

export interface MonitoringPoint {
  t: string; // recordedAt ISO
  ts: number; // epoch ms — 차트 X축(시간 비례 간격)
  temperature: number;
  humidity: number;
  co2Level: number;
  lightIntensity: number;
  phLevel: number;
  anomalyScore: number; // 이 시점 센서들 중 최대 Z (σ)
  isAnomaly: boolean; // Z>3σ 스파이크 발생
  affectedSensors: SensorKey[]; // 스파이크가 뜬 센서
  outOfRange: SensorKey[]; // 도메인 절대범위를 벗어난 센서
  healthy: boolean; // 모든 센서가 절대범위 내
}

export interface DriftAlert {
  sensor: SensorKey;
  detected: boolean;
  detectedAt: string | null; // 드리프트 시작 추정 시각
  detectedIndex: number | null; // points 배열상 인덱스
  maxStatistic: number; // CUSUM 통계량 최대치 (σ)
}

export interface MonitoringSummary {
  count: number;
  uptimeRate: number; // 절대범위 기준 가동률 %
  anomalyCount: number; // Z>3σ 스파이크 건수
  driftSensors: SensorKey[]; // CUSUM 드리프트 탐지된 센서
  latestHealthy: boolean; // 최신 판독이 정상범위인가
  windowStart: string | null;
  windowEnd: string | null;
}

export interface GrowthMonitoringResult {
  points: MonitoringPoint[];
  drift: DriftAlert[];
  healthyRanges: Record<SensorKey, [number, number]>;
  summary: MonitoringSummary;
}

export const SENSOR_META: Record<
  SensorKey,
  { label: string; unit: string; color: string }
> = {
  temperature: { label: "온도", unit: "°C", color: "#e05a3a" },
  humidity: { label: "습도", unit: "%", color: "#2f8fd6" },
  co2Level: { label: "CO₂", unit: "ppm", color: "#7a6cd6" },
  lightIntensity: { label: "광량", unit: "lux", color: "#d6a12f" },
  phLevel: { label: "양액 pH", unit: "pH", color: "#0b7d46" },
};

const SENSOR_KEYS: SensorKey[] = [
  "temperature",
  "humidity",
  "co2Level",
  "lightIntensity",
  "phLevel",
];

/**
 * 시계열 판독을 받아 시각화 가능한 이상탐지 결과로 합성한다.
 * @param readings  오름차순(과거→현재)으로 정렬된 판독
 * @param recordedAts  readings와 같은 순서·길이의 기록 시각
 */
export function analyzeGrowthMonitoring(
  readings: IoTReading[],
  recordedAts: Array<string | Date>
): GrowthMonitoringResult {
  const n = Math.min(readings.length, recordedAts.length);
  const iso = (v: string | Date) =>
    typeof v === "string" ? v : v.toISOString();

  if (n === 0) {
    return {
      points: [],
      drift: SENSOR_KEYS.filter((k) => k !== "lightIntensity").map((sensor) => ({
        sensor,
        detected: false,
        detectedAt: null,
        detectedIndex: null,
        maxStatistic: 0,
      })),
      healthyRanges: HEALTHY_RANGES,
      summary: {
        count: 0,
        uptimeRate: 0,
        anomalyCount: 0,
        driftSensors: [],
        latestHealthy: false,
        windowStart: null,
        windowEnd: null,
      },
    };
  }

  // ① 단발 이상치(Z-score) — readings와 1:1 정렬
  const anomalies = detectAnomalies(readings);

  // ③ 절대범위 위반 — 시점별 어느 센서가 도메인 범위를 벗어났나
  const points: MonitoringPoint[] = readings.slice(0, n).map((r, i) => {
    const outOfRange = SENSOR_KEYS.filter((key) => {
      const [lo, hi] = HEALTHY_RANGES[key];
      return r[key] < lo || r[key] > hi;
    });
    const a = anomalies[i];
    return {
      t: iso(recordedAts[i]),
      ts: new Date(recordedAts[i]).getTime(),
      temperature: r.temperature,
      humidity: r.humidity,
      co2Level: r.co2Level,
      lightIntensity: r.lightIntensity,
      phLevel: r.phLevel,
      anomalyScore: Math.round(a.anomalyScore * 100) / 100,
      isAnomaly: a.isAnomaly,
      affectedSensors: a.affectedSensors as SensorKey[],
      outOfRange,
      healthy: isHealthy(r),
    };
  });

  // ② 지속 드리프트(CUSUM) — detectedIndex를 시각으로 환산
  const cusum = cusumDrift(readings.slice(0, n));
  const drift: DriftAlert[] = cusum.map((c) => ({
    sensor: c.sensor as SensorKey,
    detected: c.detected,
    detectedIndex: c.detectedIndex,
    detectedAt:
      c.detectedIndex != null && c.detectedIndex < points.length
        ? points[c.detectedIndex].t
        : null,
    maxStatistic: c.maxStatistic,
  }));

  const summary: MonitoringSummary = {
    count: n,
    uptimeRate: Math.round(uptimeRate(readings.slice(0, n)) * 10) / 10,
    anomalyCount: points.filter((p) => p.isAnomaly).length,
    driftSensors: drift.filter((d) => d.detected).map((d) => d.sensor),
    latestHealthy: points[points.length - 1].healthy,
    windowStart: points[0].t,
    windowEnd: points[points.length - 1].t,
  };

  return { points, drift, healthyRanges: HEALTHY_RANGES, summary };
}
