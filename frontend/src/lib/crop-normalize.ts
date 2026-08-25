// ── 품종을 가로지르는 좌표계 ─────────────────────────────────────────────────
// 품종이 바뀌면 학습한 레시피를 버릴 것인가 이어받을 것인가 — 이 질문은 이진이
// 아니다. 이전되는 것은 설정점이 아니라 **문헌값 대비 편차**다. "우리 매장은
// 문헌보다 1.5℃ 낮은 데서 잘 나온다"의 원인은 작물이 아니라 사이트다(센서 위치,
// 공조 배치, 조도계 캘리브레이션, 창측 일사). 그래서 상추에서 배운 편차가 바질에도
// 쓸모가 있다. 반면 "22.3℃"라는 절대값은 이전되지 않는다.
//
// 좌표: z = (x − mid) / half. mid·half는 crop-profiles의 정상범위에서 온다.
// z=0이 그 품종의 문헌 최적, z=±1이 정상범위 경계다. 이 정의는 농학 사전의
// (mu, sd)와 같은 값이라, 좌표계와 베이지안 사전이 서로 어긋나지 않는다.
//
// 온도를 GDD로 옮기는 안을 검토했지만 쓰지 않았다. (T−base)/(mid−base) 비를 다시
// 범위폭으로 나누면 base가 약분되어 (T−mid)/half와 같아지고, 남는 차이는 사이트
// 편차를 ℃로 볼 것이냐 범위 상대로 볼 것이냐뿐이다. GDD가 실제로 필요한 곳은
// 품종 이전이 아니라 사이클 안의 시간 적분(하루치 온도열 → 사이클 한 값)이다.

import { CropProfile, getCrop } from "./crop-profiles";
import { FEATURES, GrowthFeature, GrowthObservation } from "./growth-recipe";

export interface FeatureScale {
  mid: number;
  half: number;
}

/** 그 품종에서 각 요인의 기준점과 폭. 정규화·사전분포가 같은 값을 본다. */
export function featureScale(crop: CropProfile, f: GrowthFeature): FeatureScale {
  const band = (r: readonly [number, number]): FeatureScale => ({
    mid: (r[0] + r[1]) / 2,
    half: (r[1] - r[0]) / 2,
  });
  switch (f) {
    case "temp":
      return band(crop.healthyRanges.temperature);
    case "humidity":
      return band(crop.healthyRanges.humidity);
    case "co2":
      return band(crop.healthyRanges.co2Level);
    case "ec":
      return band(crop.ecTarget);
    case "ph":
      return band(crop.healthyRanges.phLevel);
    case "dli":
      // 정상범위가 따로 없어 목표 DLI의 ±25%를 폭으로 쓴다
      return { mid: crop.dliTarget, half: crop.dliTarget * 0.25 };
  }
}

export function cropScales(cropKey?: string): Record<GrowthFeature, FeatureScale> {
  const crop = getCrop(cropKey);
  return Object.fromEntries(FEATURES.map((f) => [f, featureScale(crop, f)])) as Record<
    GrowthFeature,
    FeatureScale
  >;
}

/** 물리 단위 → 정규화 좌표 */
export function toNormalized(obs: GrowthObservation, cropKey?: string): number[] {
  const s = cropScales(cropKey ?? obs.cropKey);
  return FEATURES.map((f) => (obs[f] - s[f].mid) / s[f].half);
}

/** 정규화 좌표 → 물리 단위. 다른 품종의 기준으로 되돌리면 그 품종의 설정점이 된다. */
export function fromNormalized(z: number[], cropKey?: string): Record<GrowthFeature, number> {
  const s = cropScales(cropKey);
  return Object.fromEntries(
    FEATURES.map((f, i) => [f, s[f].mid + z[i] * s[f].half])
  ) as Record<GrowthFeature, number>;
}

// ── 품종 유사도 ──────────────────────────────────────────────────────────────
// 상추→마이크로그린(둘 다 저온성 엽채, 낮은 EC·저광)은 이전이 세야 하고,
// 상추→방울토마토(과채, EC 2.0~3.5, DLI 24, 사이클 100일)는 약해야 한다.
// 유사도 표를 손으로 쓰면 품종을 추가할 때마다 표를 고쳐야 하므로, 프로파일이
// 이미 갖고 있는 재배 특성을 벡터로 놓고 거리로 뽑는다. CROP_PROFILES에 항목을
// 더하는 것만으로 새 품종이 자리를 잡는다.
const DESCRIPTORS: ((c: CropProfile) => number)[] = [
  (c) => c.baseTempC, // 저온성/고온성
  (c) => (c.healthyRanges.temperature[0] + c.healthyRanges.temperature[1]) / 2,
  (c) => (c.ecTarget[0] + c.ecTarget[1]) / 2, // 염류 내성
  (c) => c.dliTarget, // 광 요구
  (c) => Math.log(c.cycleDays), // 사이클 길이는 배수로 보는 게 맞다
];

// 기술자별 산포로 나눠 단위를 없앤다. 스케일은 **고정 상수**여야 한다.
//
// 등록된 품종 집합에서 산포를 계산하면 유사도가 그 목록에 좌우된다. 실제로 그랬다 —
// 체리토마토를 목록에서 빼기만 해도 sim(상추, 마이크로그린)이 0.812에서 0.476으로
// 41% 떨어졌다. 유사도는 §이전 상한 δ(w)를 통해 권장 설정점에 직접 들어가므로,
// **한 번도 기르지 않은 품종을 프로파일 표에 등록했다는 사실만으로 다른 품종의
// 권장값이 밀린다.** 재배 특성이 아니라 표의 구성이 답을 정하는 것이다.
//
// 아래 값은 원예 작물이 실제로 갖는 범위를 기술자마다 직접 적은 것이다. 품종을
// 추가해도 기존 유사도가 움직이지 않는다.
// sd는 "이 기술자에서 1σ만큼 다르면 재배가 얼마나 다른가"로 읽는다. 시설재배
// 품목이 실제로 갖는 폭의 절반쯤으로 잡아야 엽채↔과채가 2σ 밖으로 벌어진다.
const DESCRIPTOR_SCALE: { mean: number; sd: number }[] = [
  { mean: 7, sd: 2.5 }, // GDD 기저온도 (℃) — 저온성 4 ~ 고온성 10
  { mean: 22, sd: 2 }, // 정상범위 중앙온도 (℃)
  { mean: 2.0, sd: 0.6 }, // 양액 EC 중앙 (dS/m) — 엽채 1.5 ~ 과채 2.75
  { mean: 17, sd: 4.5 }, // 목표 DLI (mol/㎡·d) — 엽채 12 ~ 과채 24
  { mean: Math.log(45), sd: 0.6 }, // log 사이클일수 — 20일 ~ 100일
];

function descriptorStats(): { mean: number; sd: number }[] {
  return DESCRIPTOR_SCALE;
}

/** 0~1. 1이면 같은 품종, 0에 가까우면 이전할 것이 없다. */
export function cropSimilarity(fromKey: string, toKey: string): number {
  if (fromKey === toKey) return 1;
  const a = getCrop(fromKey);
  const b = getCrop(toKey);
  const stats = descriptorStats();
  let d2 = 0;
  DESCRIPTORS.forEach((desc, i) => {
    const za = (desc(a) - stats[i].mean) / stats[i].sd;
    const zb = (desc(b) - stats[i].mean) / stats[i].sd;
    d2 += (za - zb) ** 2;
  });
  // 기술자 개수로 나눈다. 합으로 두면 기술자를 하나 더 적는 것만으로 모든 품종이
  // 서로 멀어져, 유사도가 재배 특성이 아니라 이 목록의 길이에 좌우된다.
  const meanD2 = d2 / DESCRIPTORS.length;
  // 평균 1σ씩 어긋난 품종에서 유사도 0.61, 2σ에서 0.14.
  return Math.round(Math.exp(-meanD2 / 2) * 1000) / 1000;
}

// ── 요인별 이전계수 ──────────────────────────────────────────────────────────
// 정규화 좌표는 "절대값이 다르다"를 이미 흡수한다. 남는 질문은 z에 대한 **반응
// 형상**이 품종 간에 같으냐다. 이건 데이터에서 뽑을 수 없는 농학 판단이라 근거를
// 적어 표로 둔다 — optimization-params의 basis 표기와 같은 취급이다.
export const FACTOR_TRANSFER: Record<GrowthFeature, { weight: number; reason: string }> = {
  ph: {
    weight: 0.95,
    reason: "등록 4품종의 정상범위가 [5.5,6.5]로 동일. 양액 화학이라 작물 의존이 약하다",
  },
  co2: {
    weight: 0.85,
    reason: "C3 광합성의 CO2 반응 곡선이 품종 간 유사하고 상한만 다르다",
  },
  humidity: {
    weight: 0.7,
    reason: "증산·병해 반응의 크기는 엽면적에 따라 다르나 방향은 같다",
  },
  temp: {
    weight: 0.6,
    reason: "z공간에서 방향은 같지만 저온성(기저 4℃)과 고온성(10℃)의 곡률이 다르다",
  },
  ec: {
    weight: 0.45,
    reason: "염류 내성이 품목별로 크게 갈린다 (엽채 1.2~1.8 vs 토마토 2.0~3.5)",
  },
  dli: {
    weight: 0.35,
    reason: "광포화점이 2배 이상 차이 나 z공간에서도 곡률이 맞지 않는다",
  },
};

/**
 * 다른 품종에서 배운 것을 이 품종·이 요인에 얼마나 실을지 (0~1).
 * 품종 유사도 × 요인별 이전계수 — 리셋/승계 이진이 아니라 연속량이다.
 */
export function transferWeight(fromKey: string, toKey: string, f: GrowthFeature): number {
  if (fromKey === toKey) return 1;
  return Math.round(cropSimilarity(fromKey, toKey) * FACTOR_TRANSFER[f].weight * 1000) / 1000;
}
