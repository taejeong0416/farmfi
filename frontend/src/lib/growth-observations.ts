// ── 실 관측 만들기 (Phase W1a) ───────────────────────────────────────────────
//
// 지금까지 레시피 학습의 입력은 `growth-recipe-synth.ts`의 합성 관측이었다.
// 여기서는 실제로 쌓인 두 표를 조인해 같은 모양(`GrowthObservation`)을 만든다.
//
//   HarvestRecord — 사이클의 끝과 수확량
//   IotData       — 그 사이클 동안의 환경 시계열
//
// 사이클은 수확 시점에서 거꾸로 잡는다. `Product.growDays`가 파종~수확 길이이므로
// 창은 `[수확 − growDays, 수확]`이고, 그 창의 IoT 측정을 하나로 접어 한 행을 만든다.
//
// ── 수확량 단위 ──────────────────────────────────────────────────────────────
// `GrowthObservation.yield`의 문서 단위는 kg/㎡지만 `HarvestRecord.quantity`는 봉이다.
// 봉당 무게를 아는 표가 없어 **봉/㎡**를 그대로 쓴다. 반응표면이 찾는 것은 최적점이고,
// 최적점은 y에 양수 상수를 곱해도 움직이지 않는다 — 단위가 갈려도 "어느 환경이
// 가장 좋은가"의 답은 같다. 절대 수량을 말할 때만 이 사실이 걸리므로 여기 적어 둔다.
//
// ── EC 결측 (이 단위의 결정) ─────────────────────────────────────────────────
// EC를 재지 않는 원천이 섞인다(`IotData.ecLevel`이 nullable인 이유). 계획은 "결측
// 사이클을 뺄지, 작물 프로파일 중앙값으로 채울지"를 물었는데 **둘 다 하지 않는다.**
//
//   채우면 — EC 열이 상수에 가까워진다. 그 상태의 회귀는 EC 곡률을 식별할 수 없는데,
//           채운 값 주변의 잡음을 곡률로 읽어 "자신 있어 보이는 가짜 최적 EC"를 낸다.
//           그 값은 데이터가 아니라 채움값이 정한 것이다.
//   빼면  — EC를 안 재는 매장은 관측이 0행이 되어 온도·습도·CO₂·pH·광량까지 통째로
//           학습이 꺼진다. EC 하나 때문에 나머지 다섯을 버리는 셈이다.
//
// 그래서 **행이 아니라 열을 뺀다.** EC 측정이 충분한 매장은 6요인으로 학습하고,
// 모자란 매장은 EC를 빼고 5요인으로 학습한다. 없는 값을 지어내지 않으면서 있는
// 값은 다 쓴다. 어느 쪽으로 갔는지는 `ecCoverage`·`droppedFeatures`에 남겨
// 화면이 "이 매장은 EC를 학습하지 않았다"고 말할 수 있게 한다.

import { prisma } from "@/lib/db";
import { getCrop, cropKeyFor, luxToDli } from "@/lib/crop-profiles";
import type { GrowthObservation } from "@/lib/growth-recipe";

/** 명기로 보는 시간대 (6시~18시). 주야 진폭을 이 경계로 가른다. */
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 18;

/**
 * EC를 6요인으로 학습할 최소 측정 비율. 이보다 낮으면 EC 열을 뺀다.
 * 절반을 넘겨야 "재고 있는 매장"이라 부를 수 있다고 보고 0.6으로 잡았다.
 */
const EC_COVERAGE_MIN = 0.6;

export interface ObservationSet {
  observations: GrowthObservation[];
  /** 관측을 만든 방식 — 화면이 "합성인가 실측인가"를 그대로 말할 수 있어야 한다 */
  source: "measured";
  /** 사이클 수 = 관측 행 수 */
  cycles: number;
  /** EC가 측정된 사이클 비율 (0~1) */
  ecCoverage: number;
  /** 학습에서 뺀 요인. EC 측정이 모자라면 ["ec"] */
  droppedFeatures: ("ec")[];
  /** 수확은 있는데 그 창에 IoT 측정이 없어 버린 사이클 수 */
  skippedNoEnvironment: number;
}

type Reading = {
  temperature: number;
  humidity: number;
  co2Level: number;
  lightIntensity: number;
  phLevel: number;
  ecLevel: number | null;
  recordedAt: Date;
};

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * 측정 간격(시간). 시계열이 몇 분 간격인지 모르면 "상한 초과 시간"을 셀 수 없다.
 * 연속한 측정 간 간격의 중앙값으로 잡는다 — 평균은 결측 구간 하나에 끌려간다.
 */
function samplingHours(readings: Reading[]): number {
  if (readings.length < 2) return 1;
  const gaps: number[] = [];
  for (let i = 1; i < readings.length; i += 1) {
    const h =
      (readings[i].recordedAt.getTime() - readings[i - 1].recordedAt.getTime()) / 3_600_000;
    if (h > 0) gaps.push(h);
  }
  if (gaps.length === 0) return 1;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/** 한 사이클의 시계열을 관측 한 행으로 접는다. */
function foldCycle(
  readings: Reading[],
  yieldPerArea: number,
  cropKey: string,
): GrowthObservation {
  const crop = getCrop(cropKey);
  const stepH = samplingHours(readings);

  const day = readings.filter((r) => {
    const h = r.recordedAt.getHours();
    return h >= DAY_START_HOUR && h < DAY_END_HOUR;
  });
  const night = readings.filter((r) => {
    const h = r.recordedAt.getHours();
    return h < DAY_START_HOUR || h >= DAY_END_HOUR;
  });

  // 주야 진폭 — 한쪽 시간대의 측정이 없으면 진폭을 말할 수 없다. 0으로 두면
  // "진폭이 0이었다"가 되어 진단이 거짓말을 하므로 undefined로 남긴다.
  const tempDiurnalAmpC =
    day.length > 0 && night.length > 0
      ? mean(day.map((r) => r.temperature)) - mean(night.map((r) => r.temperature))
      : undefined;

  // 상한 초과 누적시간 — 품종 정상범위의 위 끝을 넘긴 측정 수 × 측정 간격.
  const tempUpper = crop.healthyRanges.temperature[1];
  const tempExcessHours =
    readings.filter((r) => r.temperature > tempUpper).length * stepH;

  // DLI — 명기 측정의 평균 조도를 명기 길이만큼 적산한다. 사이클 전체를 적산하면
  // 소등 시간의 0이 평균을 끌어내려 실제보다 낮은 광량이 된다.
  const litHours = day.length * stepH;
  const cycleDays = Math.max(
    1,
    (readings[readings.length - 1].recordedAt.getTime() - readings[0].recordedAt.getTime()) /
      86_400_000,
  );
  const dli =
    day.length > 0
      ? luxToDli(mean(day.map((r) => r.lightIntensity)), litHours) / cycleDays
      : 0;

  const ecValues = readings
    .map((r) => r.ecLevel)
    .filter((v): v is number => v !== null && Number.isFinite(v));

  return {
    temp: mean(readings.map((r) => r.temperature)),
    humidity: mean(readings.map((r) => r.humidity)),
    co2: mean(readings.map((r) => r.co2Level)),
    // 측정이 없으면 NaN이 된다. 호출자가 이 행의 EC 유무로 걸러낸다.
    ec: ecValues.length > 0 ? mean(ecValues) : Number.NaN,
    ph: mean(readings.map((r) => r.phLevel)),
    dli,
    yield: yieldPerArea,
    cropKey,
    tempDiurnalAmpC,
    tempExcessHours,
  };
}

/** 접기 규칙만 따로 검사한다 (DB 없이). 테스트 전용. */
export const __foldCycleForTest = foldCycle;

/**
 * EC 열을 어떻게 다룰지 정한다 (위 주석의 결정). 관측 배열을 제자리에서 고치고
 * 뺀 요인을 돌려준다.
 *
 *   측정이 충분하면 — EC가 빠진 사이클만 버리고 6요인으로 간다
 *   모자라면       — 모든 행의 EC를 같은 값으로 눕혀 열의 분산을 0으로 만든다.
 *                    곡률이 잡히지 않으므로 파이프라인이 스스로 EC를 빼고,
 *                    없는 값을 지어내지 않았다는 사실도 남는다
 */
export function resolveEcColumn(
  observations: GrowthObservation[],
  coverageMin = EC_COVERAGE_MIN,
): { ecCoverage: number; droppedFeatures: ("ec")[] } {
  if (observations.length === 0) return { ecCoverage: 0, droppedFeatures: [] };

  const withEc = observations.filter((o) => Number.isFinite(o.ec)).length;
  const ecCoverage = withEc / observations.length;

  if (ecCoverage < coverageMin) {
    const [ecLo, ecHi] = getCrop(observations[0].cropKey).ecTarget;
    const flat = (ecLo + ecHi) / 2;
    for (const o of observations) o.ec = flat;
    return { ecCoverage, droppedFeatures: ["ec"] };
  }

  for (let i = observations.length - 1; i >= 0; i -= 1) {
    if (!Number.isFinite(observations[i].ec)) observations.splice(i, 1);
  }
  return { ecCoverage, droppedFeatures: [] };
}

/**
 * 한 지점의 실 관측을 만든다.
 *
 * @param projectId 대상 지점
 * @param areaSqm  재배 면적(㎡). 없으면 1로 두고 수확량을 그대로 쓴다 — 면적이
 *                 상수라 최적점은 같고, 절대값만 "봉/사이클"이 된다.
 */
export async function buildObservations(
  projectId: string,
  areaSqm?: number | null,
): Promise<ObservationSet> {
  const [harvests, readings] = await Promise.all([
    prisma.harvestRecord.findMany({
      where: { projectId },
      orderBy: { harvestedAt: "asc" },
      include: { product: { select: { name: true, category: true, growDays: true } } },
    }),
    prisma.iotData.findMany({
      where: { projectId },
      orderBy: { recordedAt: "asc" },
      select: {
        temperature: true,
        humidity: true,
        co2Level: true,
        lightIntensity: true,
        phLevel: true,
        ecLevel: true,
        recordedAt: true,
      },
    }),
  ]);

  const area = areaSqm && areaSqm > 0 ? areaSqm : 1;
  const observations: GrowthObservation[] = [];
  let skippedNoEnvironment = 0;

  for (const h of harvests) {
    const end = h.harvestedAt;
    const start = new Date(end.getTime() - h.product.growDays * 86_400_000);
    const window = readings.filter((r) => r.recordedAt >= start && r.recordedAt <= end);
    if (window.length === 0) {
      // 수확은 있는데 그 기간 환경 기록이 없다. 환경을 지어내면 그 행이 회귀에
      // 그대로 힘을 실으므로 버린다.
      skippedNoEnvironment += 1;
      continue;
    }
    observations.push(
      foldCycle(window, h.quantity / area, cropKeyFor(h.product.name, h.product.category)),
    );
  }

  const { ecCoverage, droppedFeatures } = resolveEcColumn(observations);

  return {
    observations,
    source: "measured",
    cycles: observations.length,
    ecCoverage,
    droppedFeatures,
    skippedNoEnvironment,
  };
}
