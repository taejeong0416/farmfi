// ── 생육레시피 테스트 베드 (합성 관측 생성기) ────────────────────────────────
// 실 수확 라벨이 쌓이기 전까지, 레시피 파이프라인이 맞는지 확인할 수단은 이것뿐이다.
// 확인이 성립하려면 생성기의 진짜 최적점을 알고 있어야 하므로 반응면을
// "오목 이차형식 + 쌍상호작용"으로 못박는다.
//
// 상호작용 계수에는 상한이 있다.
//   y = −a_i(x_i−c_i)² − a_j(x_j−c_j)² + b(x_i−c_i)(x_j−c_j)
// 의 헤시안이 음정부호이려면 |b| < 2√(a_i·a_j) 여야 한다. 이 조건을 넘기면 반응면은
// 최대점이 아니라 안장점이 되고, 진짜 최적점은 표본 상자의 모서리로 달아난다.
// 그러면 파이프라인이 무엇을 찾아야 하는지 자체가 정의되지 않으므로, 스펙을 쓸 때마다
// assertConcave로 검사한다.
//
// 오목성이 성립하면 진짜 최적점은 항상 center다 — 모든 항이 (x−c)에 대해 2차라
// center에서 기울기가 0이고, 헤시안이 음정부호이니 그 정류점이 전역 최대다.
// 상호작용은 최적점을 옮기지 않고 반응면의 모양만 바꾼다. 그래서 회수 테스트는
// "center를 되찾는가"로 깔끔하게 쓸 수 있고, 상호작용을 무시하는 방법은
// 적합도와 갭 분석에서 벌점을 받는다.

import { GrowthObservation } from "./growth-recipe";

export const SYNTH_FEATURES = ["temp", "humidity", "co2", "ec", "ph", "dli"] as const;
export type SynthFeature = (typeof SYNTH_FEATURES)[number];

export interface SynthSpec {
  /** center에서의 수율 (kg/㎡) */
  base: number;
  /** 진짜 최적 환경 — 파이프라인이 되찾아야 할 값 */
  center: Record<SynthFeature, number>;
  /** 이차 페널티 계수 a_i (> 0) */
  quad: Record<SynthFeature, number>;
  /** 쌍상호작용 [요인, 요인, 계수] */
  cross: [SynthFeature, SynthFeature, number][];
  /** 관측이 뿌려지는 범위 */
  bounds: Record<SynthFeature, [number, number]>;
  /** 관측 잡음 표준편차 (kg/㎡) */
  noiseSd: number;
  /** 물리적 하한 — 작물이 죽는 구간. 자주 걸리면 응답이 절단되어 회귀가 편향된다 */
  floor: number;
}

// 엽채류(상추) 테스트 베드. center는 crop-profiles의 정상범위 안쪽에 두어,
// 농학 클램프가 최적점을 대신 찍어주는 일 없이 데이터가 스스로 찾게 한다.
export const LEAFY_SPEC: SynthSpec = {
  base: 5.2,
  center: { temp: 22, humidity: 70, co2: 900, ec: 1.5, ph: 6.0, dli: 16 },
  quad: { temp: 0.03, humidity: 0.004, co2: 8e-6, ec: 0.8, ph: 0.6, dli: 0.02 },
  // 각 계수는 오목성 상한 2√(a_i·a_j)의 약 40%. 상호작용이 실제로 반응면을
  // 기울일 만큼 크면서 안장점은 만들지 않는 지점이다.
  cross: [
    ["temp", "co2", 4e-4], // 상한 9.8e-4
    ["ec", "dli", 0.1], // 상한 0.253
    ["temp", "humidity", 8e-3], // 상한 0.0219
  ],
  bounds: {
    temp: [16, 28],
    humidity: [55, 85],
    co2: [400, 1200],
    ec: [0.8, 2.8],
    ph: [5.3, 6.9],
    dli: [8, 24],
  },
  noiseSd: 0.12,
  floor: 0.3,
};

/** 스펙의 진짜 최적점. 오목성이 성립하는 한 center와 같다. */
export function trueOptimum(spec: SynthSpec): Record<SynthFeature, number> {
  return { ...spec.center };
}

// ── 오목성 검사 ──────────────────────────────────────────────────────────────
// 헤시안 H(대각 −2a_i, 비대각 = 상호작용 계수)가 음정부호인지 = −H가 양정부호인지를
// 촐레스키 분해 성공 여부로 판정한다. 분해가 깨지는 지점이 곧 안장점이 되는 지점이다.
export function concavityCheck(spec: SynthSpec): {
  concave: boolean;
  /** 오목성이 깨진 첫 지점 (없으면 null) */
  failedAt: string | null;
  /** 상호작용별 |계수| / 상한 — 1을 넘으면 그 쌍이 원인이다 */
  crossUsage: { pair: string; ratio: number }[];
} {
  const n = SYNTH_FEATURES.length;
  const idx = (f: SynthFeature) => SYNTH_FEATURES.indexOf(f);

  // −H 구성 (대각 2a_i, 비대각 −b)
  const M: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  SYNTH_FEATURES.forEach((f, i) => {
    M[i][i] = 2 * spec.quad[f];
  });
  for (const [a, b, coef] of spec.cross) {
    M[idx(a)][idx(b)] = -coef;
    M[idx(b)][idx(a)] = -coef;
  }

  const crossUsage = spec.cross.map(([a, b, coef]) => ({
    pair: `${a}×${b}`,
    ratio:
      Math.round((Math.abs(coef) / (2 * Math.sqrt(spec.quad[a] * spec.quad[b]))) * 1000) / 1000,
  }));

  // 촐레스키 — 대각이 0 이하로 떨어지면 양정부호가 아니다
  const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = M[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 1e-12) {
          return { concave: false, failedAt: SYNTH_FEATURES[i], crossUsage };
        }
        L[i][i] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  return { concave: true, failedAt: null, crossUsage };
}

export function assertConcave(spec: SynthSpec): void {
  const c = concavityCheck(spec);
  if (!c.concave) {
    const over = c.crossUsage.filter((u) => u.ratio >= 1).map((u) => `${u.pair} ${u.ratio}배`);
    throw new Error(
      `합성 스펙이 오목하지 않다 (${c.failedAt}에서 깨짐). ` +
        (over.length ? `상호작용 상한 초과: ${over.join(", ")}` : "이차 페널티 계수를 확인하라.")
    );
  }
}

// ── 관측 생성 ────────────────────────────────────────────────────────────────
function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 잡음 없는 참 수율 — 회수 테스트가 기준으로 쓴다. */
export function trueYield(spec: SynthSpec, x: Record<SynthFeature, number>): number {
  const d = (f: SynthFeature) => x[f] - spec.center[f];
  let y = spec.base;
  for (const f of SYNTH_FEATURES) y -= spec.quad[f] * d(f) ** 2;
  for (const [a, b, coef] of spec.cross) y += coef * d(a) * d(b);
  return Math.max(spec.floor, y);
}

export interface SynthResult {
  observations: GrowthObservation[];
  /** 하한에 걸린 관측 비율 — 높으면 응답이 절단되어 회귀가 편향된다 */
  floorRate: number;
}

export function generateObservations(
  spec: SynthSpec,
  n: number,
  seed = 7,
  cropKey = "leafy"
): SynthResult {
  assertConcave(spec);
  const rand = seededRand(seed);
  // 박스-뮐러 — OLS가 가정하는 정규 잡음
  const gauss = () => {
    const u = Math.max(rand(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };

  const observations: GrowthObservation[] = [];
  let floored = 0;
  for (let i = 0; i < n; i++) {
    const env = {} as Record<SynthFeature, number>;
    for (const f of SYNTH_FEATURES) {
      const [lo, hi] = spec.bounds[f];
      env[f] = lo + rand() * (hi - lo);
    }
    const clean = trueYield(spec, env);
    const noisy = clean + gauss() * spec.noiseSd;
    if (noisy <= spec.floor) floored++;
    observations.push({ ...env, cropKey, yield: Math.max(spec.floor, noisy) });
  }
  return { observations, floorRate: Math.round((floored / n) * 1000) / 1000 };
}
