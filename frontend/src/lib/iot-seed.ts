// ── IoT 60일치 시드 데이터 생성기 ────────────────────────────────────────────
// prisma/seed.ts와 /api/demo/reset이 사용한다.
//
// 이 시드의 역할은 "그럴듯한 노이즈"가 아니라 **탐지기가 잡아야 할 현상을 담는 것**이다.
// 무작위 단발 이상치만 있으면 지속 드리프트 탐지기(CUSUM)와 DLI 판정은 탐지할 대상이
// 없어 화면에서 영원히 0으로 뜬다. 그래서 세 가지 고장 시나리오를 시간축에 심는다:
//
//   ① 12~18일차  냉방 성능 저하 — 온도 평균이 하루 +0.6℃씩 밀린다.
//      단발 스파이크가 아니라 완만한 평균 이동이라 Z-score는 못 잡고 CUSUM만 잡는다.
//      최적대(18~24℃)는 벗어나되 고장 게이트(15~28℃) 안이라 "주의" 등급에 머문다.
//   ② 30일차     양액 펌프 막힘 — pH가 반나절 4.2로 급락.
//      고장 게이트까지 뚫는 단발 사고라 Z-score·게이트가 동시에 잡고 가동률이 꺾인다.
//   ③ 45일차~    LED 광량 열화 — 조도가 서서히 28% 감소.
//      순간 조도는 어떤 절대 상한에도 안 걸린다. 일적산(DLI) 판정만이 잡는 실패 모드다.
//
// growthRate는 날짜의 함수가 아니라 **환경의 함수**다. 적산온도(GDD)로 진행하고
// 일적산광량(DLI) 부족분만큼 지연된다 — 위 세 고장이 실제로 생장 곡선을 눌러야
// "이상 → 탐지 → 조치 → 회복"이 한 화면에서 보인다.
//
// 재현성: projectId 해시로 시드된 mulberry32. 같은 프로젝트는 항상 같은 계열.

import { getCrop, luxToDli, LUX_TO_PPFD } from "./crop-profiles";
import { mulberry32 } from "./prng";

export interface IotSeedRecord {
  projectId: string;
  temperature: number;
  humidity: number;
  co2Level: number;
  lightIntensity: number;
  phLevel: number;
  growthRate: number;
  anomalyScore: number;
  isAnomaly: boolean;
  recordedAt: Date;
}

/** 점등 스케줄. 관행 = 아침 점등, TOU 최적 = 경부하 시간대로 이동한 블록. */
export type LightSchedule = "conventional" | "tou-optimized";

export interface IotSeedOptions {
  cropKey?: string;
  schedule?: LightSchedule;
  /** 고장 시나리오를 심을지. false면 무고장 계열(정상 운영 대조군). */
  scenario?: boolean;
}

const DAYS = 60;
const STEPS_PER_DAY = 48; // 30분 간격
const STEP_H = 24 / STEPS_PER_DAY;

// 시나리오 타임라인 (dayIndex 기준, 0 = 60일 전)
const COOLING_FAULT_START = 12;
const COOLING_FAULT_END = 18; // 이 날 수리 완료 → 다음 스텝부터 정상
const COOLING_DRIFT_PER_DAY = 0.6; // ℃/day
const PUMP_FAULT_DAY = 30;
const PUMP_FAULT_HOURS: [number, number] = [8, 14];
const LED_DECAY_START = 45;
const LED_DECAY_FLOOR = 0.72; // 59일차 조도 계수

// 문자열 → 32bit 시드. 지점마다 다른 계열을 주되 재실행 시 동일하게.
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 시각(h) → 점등 여부. 두 스케줄 모두 명기 16h·연속 암기 8h. */
function isLit(hour: number, schedule: LightSchedule): boolean {
  if (schedule === "tou-optimized") {
    // 경부하(심야~오전) 블록 — 22시 점등, 익일 14시 소등.
    return hour >= 22 || hour < 14;
  }
  return hour >= 6 && hour < 22;
}

export function buildIotRecords(
  projectId: string,
  now: Date,
  options: IotSeedOptions = {}
): IotSeedRecord[] {
  const { cropKey, schedule = "conventional", scenario = true } = options;
  const crop = getCrop(cropKey);
  const rand = mulberry32(hashSeed(projectId));

  // 정상 운전점 — 최적대 중앙. 목표 DLI를 명기 16h로 채우는 조도를 역산한다.
  const [tLo, tHi] = crop.healthyRanges.temperature;
  const tempMid = (tLo + tHi) / 2;
  const [hLo, hHi] = crop.healthyRanges.humidity;
  const humidityMid = (hLo + hHi) / 2;
  const [pLo, pHi] = crop.healthyRanges.phLevel;
  const phMid = (pLo + pHi) / 2;
  const litHours = 16;
  const baseLux = (crop.dliTarget * 1e6) / (LUX_TO_PPFD * 3600 * litHours);

  const records: IotSeedRecord[] = [];
  let progress = 0; // 현 사이클 진행률 0~100

  for (let dayIndex = 0; dayIndex < DAYS; dayIndex++) {
    // ── 그날의 고장 상태 ──
    const coolingDrift =
      scenario && dayIndex >= COOLING_FAULT_START && dayIndex <= COOLING_FAULT_END
        ? (dayIndex - COOLING_FAULT_START + 1) * COOLING_DRIFT_PER_DAY
        : 0;
    const ledFactor =
      scenario && dayIndex >= LED_DECAY_START
        ? 1 -
          (1 - LED_DECAY_FLOOR) *
            ((dayIndex - LED_DECAY_START) / (DAYS - 1 - LED_DECAY_START))
        : 1;

    let dayGdd = 0;
    let dayDli = 0;
    const dayRecords: IotSeedRecord[] = [];

    for (let step = 0; step < STEPS_PER_DAY; step++) {
      const hour = step * STEP_H;
      const recordedAt = new Date(
        now.getTime() -
          (DAYS - dayIndex) * 24 * 60 * 60 * 1000 +
          step * 30 * 60 * 1000
      );

      // 일주기 변동 + 관측잡음. 점등 중에는 등이 열을 내 살짝 높다.
      const lit = isLit(hour, schedule);
      let temperature =
        tempMid +
        Math.sin((hour / 24) * 2 * Math.PI) * 0.9 +
        (lit ? 0.4 : -0.4) +
        (rand() - 0.5) * 0.6 +
        coolingDrift;
      let humidity =
        humidityMid + Math.cos((hour / 24) * 2 * Math.PI) * 4 + (rand() - 0.5) * 3;
      // 점등 중 광합성으로 CO2가 소모돼 낮아지고, 시비로 다시 채워진다.
      let co2Level =
        (lit ? 900 : 1050) + (rand() - 0.5) * 120;
      let lightIntensity = lit ? baseLux * ledFactor * (0.97 + rand() * 0.06) : 0;
      let phLevel = phMid + (rand() - 0.5) * 0.3;

      let isAnomaly = false;
      let anomalyScore = rand() * 1.5;

      // ② 양액 펌프 막힘 — 반나절 pH 급락
      if (
        scenario &&
        dayIndex === PUMP_FAULT_DAY &&
        hour >= PUMP_FAULT_HOURS[0] &&
        hour < PUMP_FAULT_HOURS[1]
      ) {
        phLevel = 4.2 + rand() * 0.2;
        isAnomaly = true;
        anomalyScore = 4.2 + rand();
      } else if (rand() < 0.005) {
        // 상시 단발 잡음 — 시나리오 신호를 덮지 않도록 낮은 비율로만 둔다.
        const sensor = Math.floor(rand() * 4);
        if (sensor === 0) temperature += 6 + rand() * 3;
        else if (sensor === 1) humidity += 22 + rand() * 6;
        else if (sensor === 2) co2Level += 900 + rand() * 400;
        else phLevel -= 1.2 + rand() * 0.4;
        isAnomaly = true;
        anomalyScore = 3.4 + rand() * 1.6;
      }

      dayGdd += Math.max(0, temperature - crop.baseTempC) * (STEP_H / 24);
      dayDli += luxToDli(lightIntensity, STEP_H);

      dayRecords.push({
        projectId,
        temperature: Math.round(temperature * 10) / 10,
        humidity: Math.round(humidity * 10) / 10,
        co2Level: Math.round(co2Level),
        lightIntensity: Math.round(lightIntensity),
        phLevel: Math.round(phLevel * 100) / 100,
        growthRate: 0, // 그날 환경이 확정된 뒤 채운다
        anomalyScore: Math.round(anomalyScore * 100) / 100,
        isAnomaly,
        recordedAt,
      });
    }

    // ── 생장 진행: 적산온도로 나아가고, 광부족만큼 지연된다 ──
    // 광이 목표를 넘어도 생장은 선형으로 안 늘어난다(광포화) — 상한 1.0.
    const lightFactor = Math.min(1, Math.max(0.3, dayDli / crop.dliTarget));
    const dayProgress = (dayGdd / crop.targetGdd) * 100 * lightFactor;
    const startProgress = progress;
    let endProgress = progress + dayProgress;
    if (endProgress >= 100) endProgress -= 100; // 수확 → 재정식
    progress = endProgress;

    // 사이클 경계를 넘지 않은 날만 하루 안에서 보간한다(경계일은 톱니를 남긴다).
    const wraps = endProgress < startProgress;
    dayRecords.forEach((r, i) => {
      const frac = i / STEPS_PER_DAY;
      const p = wraps
        ? startProgress + (100 - startProgress) * frac
        : startProgress + dayProgress * frac;
      r.growthRate = Math.round(Math.min(100, p) * 10) / 10;
    });

    records.push(...dayRecords);
  }

  return records;
}
