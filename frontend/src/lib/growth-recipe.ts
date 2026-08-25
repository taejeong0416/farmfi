// ── AI 생육레시피 분석 알고리즘 ──────────────────────────────────────────────
// 스케줄링(어떻게 싸게 달성)의 짝: "무엇을 목표로 할지"(최적 환경 = 생육레시피)를
// 데이터에서 학습한다. v15 기획: 환경 데이터↔수확량 상관 분석 → 최적 생육조건
// 도출 → 비전공 운영자의 진입장벽 완화.
//
// 3단계:
//   ① 다변량 반응표면 최적점: 주효과 + 쌍상호작용항(temp*co2, ec*dli, temp*humidity)으로
//      6D 결합 최적점 도출 (독립 1D ≠ 6D 결합 최적 — 상호작용 반영)
//   ② 표면 민감도: 관측범위에서 각 요인이 예측 수율을 얼마나 움직이나
//   ③ 갭 분석: 현재 사이트 조건 vs 최적 레시피 → 실행 권고 + 모델 기반 수율 상방
//
// ②와 ③은 같은 계수에서 나온다. 별도 모델로 중요도를 내면 "습도가 가장 중요"와
// "습도는 옮길 게 없다"가 한 화면에 같이 뜨고, 두 숫자가 어긋나도 검출할 길이 없다.
//
// crop-profiles의 하드코딩 목표(DLI·정상범위)를 데이터가 대체하고, 그 학습된
// 목표를 최적화 스택이 효율적으로 달성한다 — 두 시스템이 맞물린다.

import { cropScales, fromNormalized, toNormalized } from "./crop-normalize";

export interface GrowthObservation {
  temp: number; // ℃
  humidity: number; // %
  co2: number; // ppm
  ec: number; // dS/m
  ph: number;
  dli: number; // mol/m²/day
  yield: number; // kg/㎡ (사이클 수확량)
  /** 어느 품종의 사이클인가. 품종을 가로지르는 이전 강도를 이 값으로 정한다 */
  cropKey?: string;
  /**
   * 이 사이클의 설정값이 무작위로 배정됐다는 표식. 배정된 요인과 그 값(정규화 좌표)을
   * 남긴다.
   *
   * 이 칸이 인과 주장의 전부다. 표식 없이 쌓인 관측에서는 "온도가 높았던 사이클의
   * 수율이 높았다"와 "온도가 높은 사이클은 여름이고 여름엔 일사가 많았다"가 같은
   * 숫자를 만들고, 어떤 분석으로도 갈라지지 않는다. 무작위 배정은 그 둘을 끊지만,
   * 끊었다는 사실이 기록돼야 나중에 쓸 수 있다.
   */
  assignment?: { feature: GrowthFeature; z: number };
  /**
   * 사이클 평균이 지운 것을 되살리는 두 요약값. 사이클 28일 × 24시간 = 672개
   * 측정이 평균 하나로 접히면서 사라지는 정보 중 가장 잘 알려진 둘이다.
   *
   * 주야 진폭 — 평균 22℃가 (주 26 / 야 18)인지 (내내 22)인지가 전혀 다른 작물을
   * 만든다. DIF는 초장 제어의 표준 수단인데 평균에서는 구분되지 않는다.
   *
   * 상한 초과 누적시간 — 34℃ 3시간이 준 손상은 되돌아오지 않는데, 나머지가 21℃면
   * 평균은 22℃로 멀쩡하다. 스트레스는 비선형·비가역이고 평균은 선형·가역이다.
   *
   * 둘 다 회귀 입력이 아니다. 열을 늘리면 파라미터가 늘고, 연 12행이 쌓이는
   * 데이터가 그걸 감당하지 못한다. 대신 초과시간은 가중치로(스트레스 사이클은
   * 반응표면 위에 있지 않은 관측이다), 주야 진폭은 진단 플래그로 쓴다.
   */
  tempDiurnalAmpC?: number; // ℃ (주간 평균 − 야간 평균)
  tempExcessHours?: number; // h (품종 상한을 넘긴 시간의 합)
}

export type GrowthFeature = "temp" | "humidity" | "co2" | "ec" | "ph" | "dli";
export const FEATURES: readonly GrowthFeature[] = ["temp", "humidity", "co2", "ec", "ph", "dli"];

export const FEATURE_LABEL: Record<string, string> = {
  temp: "온도",
  humidity: "습도",
  co2: "CO₂",
  ec: "양액EC",
  ph: "양액pH",
  dli: "광량(DLI)",
};

export interface RecipeSensitivity {
  feature: string;
  label: string;
  /**
   * 다른 요인을 탐색범위 중앙에 두고 이 요인만 범위 끝까지 훑을 때 예측 수율이
   * 움직이는 폭 (kg/㎡). 곡률과 관측 폭이 함께 반영된다 — 곡률이 커도 좁게만
   * 관측했으면 폭이 작고, 그게 "이 데이터가 이 요인에 대해 아는 정도"다.
   */
  range: number;
  /** 여섯 요인 폭의 합에서 차지하는 비율 0~1 */
  share: number;
  correlation: number; // 수율과의 피어슨 상관
}

export interface RecipeSetpoint {
  feature: string;
  label: string;
  optimum: number; // 다변량 반응표면 결합 최적점
  current: number; // 현 사이트 평균
  unit: string;
  /**
   * 최적점이 탐색범위 끝에 붙었나. 붙었다면 반응표면이 그 방향으로 계속 올라간다는
   * 뜻이고, 표시된 값은 "여기가 최적"이 아니라 "여기까지밖에 못 본다"는 뜻이다.
   */
  atBoundary: boolean;
  /**
   * 이차항 계수의 부트스트랩 신뢰구간이 0을 포함한다 — 이 요인의 곡률이 잡히지
   * 않았다는 뜻이다. 정점 −b/(2β)의 분모가 0 근처라 위치가 잡음에서 나오므로
   * 최적화에서 빼고 현재값에 고정한다. optimum은 그 고정된 값이다.
   */
  curvatureUnresolved: boolean;
}

/**
 * 적합된 반응표면이 실제로 최대점을 갖는가. 이차형식이 안장이면 좌표상승은 상자
 * 모서리를 답으로 내놓는데, 그 값은 최적점이 아니라 관측범위의 끝일 뿐이다.
 */
export type SurfaceVerdict = "최대점" | "안장점" | "판정불가";

export interface GrowthRecipe {
  samples: number;
  sensitivity: RecipeSensitivity[];
  recipe: RecipeSetpoint[];
  /** 5-fold CV R². 표본이 파라미터 수에 못 미치면 null — 0은 "설명력 없음"이라 뜻이 다르다 */
  modelR2: number | null;
  surface: SurfaceVerdict;
  /** 열 스트레스로 무게가 절반 아래로 내려간 관측의 비율 */
  stressDownweightedShare: number;
  /**
   * 주야 진폭이 정상범위 폭을 넘어 사이클 평균이 대표성을 잃은 관측의 비율.
   * 높으면 온도 권고의 근거가 약하다 — 평균이 같아도 실제 온도곡선이 다르다.
   */
  diurnalFlaggedShare: number;
  note: string;
  _beta?: number[]; // 정규화 좌표에서의 반응표면 계수 (갭 분석이 다시 쓴다)
  _cropKey?: string; // _beta가 어느 품종의 좌표계인지
}

export const UNIT: Record<string, string> = { temp: "℃", humidity: "%", co2: "ppm", ec: "dS/m", ph: "", dli: "mol" };

// ── 다변량 반응표면 설계행렬 (16열) ─────────────────────────────────────────
// FEATURES 순서: [temp(0), humidity(1), co2(2), ec(3), ph(4), dli(5)]
// 열: [1, f0,f1,f2,f3,f4,f5, f0²,f1²,f2²,f3²,f4²,f5², f0*f2(temp*co2), f3*f5(ec*dli), f0*f1(temp*hum)]
const NPARAMS = 16;

function buildDesignRow(x: number[]): number[] {
  const [f0, f1, f2, f3, f4, f5] = x;
  return [
    1, f0, f1, f2, f3, f4, f5,
    f0 * f0, f1 * f1, f2 * f2, f3 * f3, f4 * f4, f5 * f5,
    f0 * f2, f3 * f5, f0 * f1,
  ];
}

function dotV(a: number[], b: number[]): number {
  return a.reduce((s, ai, i) => s + ai * b[i], 0);
}

function predictRS(beta: number[], x: number[]): number {
  return dotV(beta, buildDesignRow(x));
}

// ── 재적합 원시함수 ──────────────────────────────────────────────────────────
// 부트스트랩은 같은 적합을 수백 번 되풀이한다. analyzeGrowthRecipe 전체를 돌리면
// 부스팅·교차검증까지 딸려와 느리므로, 표면 적합과 최적화만 따로 내어 쓴다.
// 입력·출력 모두 정규화 좌표다.

/** 정규화 좌표 관측에서 반응표면 계수를 적합한다. */
export function fitResponseSurface(Z: number[][], y: number[], w?: number[]): number[] {
  return olsFit(Z.map(buildDesignRow), y, w);
}

/** 계수와 탐색범위에서 6D 결합 최적점(정규화 좌표)을 찾는다. */
export function optimumZ(
  beta: number[],
  bounds: [number, number][],
  pinned?: (number | null)[]
): number[] {
  return coordinateAscent(beta, bounds, pinned);
}

export function predictSurface(beta: number[], z: number[]): number {
  return predictRS(beta, z);
}

/**
 * 탐색범위 = 관측범위 ∩ 농학 정상범위. z에서 농학 정상범위는 정의상 [-1,1]이다.
 * clamp를 끄면 관측범위만 쓴다 — 농학 지식이 답을 대신 내지 않는지 볼 때 필요하다.
 */
export function zBounds(Z: number[][], clamp: boolean): [number, number][] {
  return FEATURES.map((_, fi) => {
    const vals = Z.map((z) => z[fi]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    if (!clamp) return [lo, hi];
    const cLo = Math.max(lo, -1);
    const cHi = Math.min(hi, 1);
    // 교집합이 비면 관측범위로 물러선다 — 외삽하느니 못 봤다고 하는 편이 낫다
    return (cLo < cHi ? [cLo, cHi] : [lo, hi]) as [number, number];
  });
}

// 가중 OLS 정규방정식: (D^T W D + λI) β = D^T W y (λ=1e-6 릿지 정규화로 수치 안정)
// 가중치를 생략하면 모두 1 — 보통의 최소제곱이다.
function olsFit(D: number[][], y: number[], w?: number[]): number[] {
  const p = D[0].length;
  const n = D.length;
  const A: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  const b: number[] = Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    const wi = w ? w[i] : 1;
    for (let j = 0; j < p; j++) {
      b[j] += wi * D[i][j] * y[i];
      for (let k = j; k < p; k++) {
        A[j][k] += wi * D[i][j] * D[i][k];
        A[k][j] = A[j][k];
      }
    }
  }
  for (let j = 0; j < p; j++) A[j][j] += 1e-6; // 릿지 정규화
  return gaussianElimP(A, b);
}

// ── 열 스트레스 가중 ─────────────────────────────────────────────────────────
// 상한을 오래 넘긴 사이클은 열 손상이 이미 일어난 사이클이다. 그 수율은 환경↔수율
// 반응표면 위에 있지 않다 — 사고가 난 관측이다. 정상 사이클과 같은 무게로 적합하면
// 표면 자체가 휘고, 스트레스가 평균 온도와 함께 움직이므로 온도 최적점이 실제보다
// 낮게 끌려간다.
//
// 초과시간을 회귀 열로 넣지 않는 이유는 두 가지다. 파라미터가 늘고, 그 항에는
// 이차항이 없어(스트레스는 단조 나쁨이라 최적값이 0이다) 헤시안 대각이 0이 되어
// §최대점 판정이 항상 안장점으로 떨어진다. 가중치로 쓰면 자유도를 하나도 먹지
// 않으면서 오염만 걷어낸다.

/** 이만큼 초과하면 무게가 절반이 된다 (h). 하루치 누적을 기준으로 잡았다 */
export const STRESS_HALF_HOURS = 24;

export function observationWeights(obs: GrowthObservation[]): number[] {
  return obs.map((o) => 1 / (1 + (o.tempExcessHours ?? 0) / STRESS_HALF_HOURS));
}

// p×p 가우스 소거 (부분 피벗팅)
function gaussianElimP(A: number[][], b: number[]): number[] {
  const p = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < p; c++) {
    let piv = c;
    for (let r = c + 1; r < p; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-10) continue;
    for (let r = 0; r < p; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= p; k++) M[r][k] -= f * M[c][k];
    }
  }
  return Array.from({ length: p }, (_, i) =>
    Math.abs(M[i][i]) < 1e-10 ? 0 : M[i][p] / M[i][i]
  );
}

// 다른 요인을 x에 고정했을 때 요인 i의 1D 부분문제 계수.
//   f(z_i) = bQuad·z_i² + bLin·z_i + const
// 상호작용항에서 z_i가 포함된 열의 기여가 bLin으로 들어간다.
//   col 13 = temp*co2:  i=0 → co2 고정값 곱, i=2 → temp 고정값 곱
//   col 14 = ec*dli:    i=3 → dli 고정값 곱, i=5 → ec 고정값 곱
//   col 15 = temp*hum:  i=0 → hum 고정값 곱, i=1 → temp 고정값 곱
// 최적화와 민감도가 이 하나를 같이 쓴다 — 상호작용 배선이 두 벌이면 어긋난다.
function marginalCoeffs(beta: number[], x: number[], i: number): { bQuad: number; bLin: number } {
  const bQuad = beta[7 + i];
  let bLin = beta[1 + i];
  if (i === 0) bLin += beta[13] * x[2] + beta[15] * x[1];
  else if (i === 1) bLin += beta[15] * x[0];
  else if (i === 2) bLin += beta[13] * x[0];
  else if (i === 3) bLin += beta[14] * x[5];
  else if (i === 5) bLin += beta[14] * x[3];
  return { bQuad, bLin };
}

// 좌표 상승 (각 변수 1D 최적화 반복 → 6D 결합 최적점)
// pinned[i]가 있으면 그 축은 고정한다 — 곡률이 안 잡힌 요인을 최적화에서 뺄 때 쓴다.
function coordinateAscent(
  beta: number[],
  bounds: [number, number][],
  pinned?: (number | null)[],
  maxIter = 200
): number[] {
  const x = bounds.map(([lo, hi], i) => pinned?.[i] ?? (lo + hi) / 2);
  for (let iter = 0; iter < maxIter; iter++) {
    let converged = true;
    for (let i = 0; i < 6; i++) {
      if (pinned?.[i] != null) continue;
      const { bQuad, bLin } = marginalCoeffs(beta, x, i);
      const [lo, hi] = bounds[i];
      let xi: number;
      if (bQuad < -1e-10) {
        xi = Math.max(lo, Math.min(hi, -bLin / (2 * bQuad)));
      } else {
        const fLo = bQuad * lo * lo + bLin * lo;
        const fHi = bQuad * hi * hi + bLin * hi;
        xi = fHi >= fLo ? hi : lo;
      }
      if (Math.abs(xi - x[i]) > 1e-5) converged = false;
      x[i] = xi;
    }
    if (converged) break;
  }
  return x;
}

/**
 * 요인별 표면 민감도 — 다른 요인을 탐색범위 중앙에 두고 이 요인만 범위 전체를
 * 훑을 때 예측 수율이 움직이는 폭.
 *
 * 별도 트리 모델의 SHAP 대신 이걸 쓴다. 권고를 만드는 계수에서 직접 나오므로
 * 갭 분석과 어긋날 수가 없고, 표본 잡음이 순위를 흔드는 정도도 훨씬 작다.
 * 단위는 kg/㎡ — 좌표계를 바꿔도 값이 같다.
 */
export function surfaceSensitivity(beta: number[], bounds: [number, number][]): number[] {
  const center = bounds.map(([lo, hi]) => (lo + hi) / 2);
  return bounds.map(([lo, hi], i) => {
    const { bQuad, bLin } = marginalCoeffs(beta, center, i);
    const g = (z: number) => bQuad * z * z + bLin * z;
    const vals = [g(lo), g(hi)];
    // 정점이 상자 안에 있으면 극값이 끝이 아니라 거기다
    if (Math.abs(bQuad) > 1e-12) {
      const vz = -bLin / (2 * bQuad);
      if (vz > lo && vz < hi) vals.push(g(vz));
    }
    return Math.max(...vals) - Math.min(...vals);
  });
}

// ── 요인별 곡률 판정 ─────────────────────────────────────────────────────────
// 표면 판정(아래)은 여섯 축을 한꺼번에 본다. 그런데 실패는 요인별로 온다.
//
// DLI는 정상범위 안에서 포화형이라 반응이 거의 평탄하고, pH도 6.0 근처에서 평탄하다.
// 참 곡률이 0인데 관측에는 잡음이 있으니 최소제곱은 이차항을 0이 아닌 값으로 낸다.
// 부호를 잡음이 정한다. 음수로 나오면 "정점이 있다"고 판정하고, 정점 −b/(2β)는
// 분모가 0에 가까워 폭발한다. 상자로 클리핑되니 화면에는 얌전한 숫자가 뜨지만
// 그 값은 상자 모서리이거나 잡음의 산물이다.
//
// 이차항 계수를 부트스트랩해서 신뢰구간이 0을 포함하면 그 요인은 곡률 미확인으로
// 보고 최적화에서 뺀다. 함수 형태를 요인마다 다르게 고르는 것이 정공법이지만,
// 실데이터 없이 형태를 정하는 건 또 하나의 미검증 가정을 얹는 일이다. 곡률이
// 안 잡혔다는 사실을 말로 내는 편이 지금 상태에서 정직하다.
function curvatureUnresolved(
  Z: number[][],
  y: number[],
  w: number[],
  replicates = 200,
  seed = 23
): boolean[] {
  const n = Z.length;
  if (n < NPARAMS) return Array(6).fill(true);

  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const draws: number[][] = Array.from({ length: 6 }, () => []);
  for (let b = 0; b < replicates; b++) {
    const zi: number[][] = [];
    const yi: number[] = [];
    const wi: number[] = [];
    for (let k = 0; k < n; k++) {
      const j = Math.min(n - 1, Math.floor(rand() * n));
      zi.push(Z[j]);
      yi.push(y[j]);
      wi.push(w[j]);
    }
    const beta = fitResponseSurface(zi, yi, wi);
    for (let i = 0; i < 6; i++) if (Number.isFinite(beta[7 + i])) draws[i].push(beta[7 + i]);
  }

  return draws.map((d) => {
    if (d.length < 20) return true;
    d.sort((a, b) => a - b);
    const lo = d[Math.floor(0.025 * (d.length - 1))];
    const hi = d[Math.ceil(0.975 * (d.length - 1))];
    return lo <= 0 && hi >= 0; // 구간이 0을 걸치면 부호조차 못 정한 것이다
  });
}

// ── 표면 진단: 이 이차형식이 최대점을 갖는가 ────────────────────────────────
// 헤시안 H가 음정부호여야 정류점이 최대다. 안장이면 좌표상승이 상자 모서리를
// 답으로 내는데, 화면에는 그것도 "최적 22.3℃"로 똑같이 보인다. 둘을 구분한다.
// 비대각 성분은 설계행렬에 넣은 세 쌍뿐이다 — 13:temp×co2, 14:ec×dli, 15:temp×hum.
function surfaceVerdict(beta: number[]): SurfaceVerdict {
  const n = 6;
  const H: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) H[i][i] = 2 * beta[7 + i];
  const setPair = (i: number, j: number, v: number) => {
    H[i][j] = v;
    H[j][i] = v;
  };
  setPair(0, 2, beta[13]);
  setPair(3, 5, beta[14]);
  setPair(0, 1, beta[15]);

  // −H의 촐레스키가 성공하면 H는 음정부호 = 최대점
  // 곡률이 통째로 사라진 적합(랭크 부족·표본 부족)은 안장이 아니라 판정불가다
  if (H.every((row, i) => Math.abs(row[i]) < 1e-9)) return "판정불가";

  const M = H.map((row) => row.map((v) => -v));
  const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = M[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 1e-12) return "안장점";
        L[i][i] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  return "최대점";
}

// 5-fold 교차검증 R² (훈련 R² 대신 — 과적합 제어)
// 적합과 채점 모두 가중한다. 스트레스 사이클을 무게를 낮춰 적합해 놓고 채점만
// 같은 무게로 하면, 일부러 안 맞춘 행 때문에 설명력이 낮게 나온다.
function cvR2(X: number[][], y: number[], w: number[], nFolds = 5): number | null {
  const n = X.length;
  if (n < NPARAMS * 2) return null; // 표본이 파라미터의 2배 미만 — 판정 자체가 불가
  const wSum = w.reduce((a, b) => a + b, 0);
  const yMean = y.reduce((s, yi, i) => s + w[i] * yi, 0) / wSum;
  const foldSize = Math.floor(n / nFolds);
  let ssRes = 0, ssTot = 0;
  for (let fold = 0; fold < nFolds; fold++) {
    const ts = fold * foldSize;
    const te = fold === nFolds - 1 ? n : ts + foldSize;
    const trainD = [
      ...X.slice(0, ts).map(buildDesignRow),
      ...X.slice(te).map(buildDesignRow),
    ];
    const trainY = [...y.slice(0, ts), ...y.slice(te)];
    const trainW = [...w.slice(0, ts), ...w.slice(te)];
    const beta = olsFit(trainD, trainY, trainW);
    for (let i = ts; i < te; i++) {
      ssRes += w[i] * (y[i] - predictRS(beta, X[i])) ** 2;
      ssTot += w[i] * (y[i] - yMean) ** 2;
    }
  }
  // 음수를 0으로 자르지 않는다. 음수는 "평균보다 못 맞힌다"는 판정이고, 0은 "설명력이
  // 없다"는 판정이다. 잘라서 합치면 화면에서 두 상태가 같은 숫자로 나가고, 그건 이 모듈이
  // null(판정 불가)과 0(판정 결과)을 구분하는 이유와 정면으로 어긋난다.
  return ssTot > 0 ? 1 - ssRes / ssTot : 0;
}

// ── 반응표면 적합 → 결합 최적점 · 요인별 민감도 ──────────────────────────────
export function analyzeGrowthRecipe(obs: GrowthObservation[], opts?: {
  cropKey?: string; // 농학 정상범위와 관측범위 교집합으로 외삽 방지
}): GrowthRecipe {
  const n = obs.length;
  const cropKey = opts?.cropKey ?? obs.find((o) => o.cropKey)?.cropKey;
  // 학습은 정규화 좌표에서 한다. 원시 단위로 적합하면 co2² 열이 1e6 규모가 되어
  // 설계행렬 조건수가 무너지고, 무엇보다 품종이 섞인 관측을 한 표면에 올릴 수 없다.
  // z는 관측마다 그 관측의 품종 기준으로 잡으므로 상추 사이클과 바질 사이클이
  // 같은 좌표계에서 만난다.
  const X = obs.map((o) => toNormalized(o, o.cropKey ?? cropKey));
  const y = obs.map((o) => o.yield);
  const w = observationWeights(obs);
  const wSum = w.reduce((a, b) => a + b, 0);
  const yMean = y.reduce((s, yi, i) => s + w[i] * yi, 0) / wSum;

  // 다변량 반응표면 적합 (주효과 + 이차항 + 쌍상호작용)
  const D = X.map(buildDesignRow);
  const beta = olsFit(D, y, w);

  // 5-fold CV R²
  const r2 = cvR2(X, y, w);

  // 다항식 외삽(temp 14.8℃ 같은 비현실값)을 막기 위해 농학 정상범위로 클램프한다
  const bounds = zBounds(X, Boolean(cropKey));

  // 곡률이 안 잡힌 축은 최적화에서 빼고 현재 관측 평균에 고정한다. 잡음이 정한
  // 정점으로 운영자를 움직이게 하느니 "이 요인은 지금 값을 유지한다"가 맞다.
  const unresolved = curvatureUnresolved(X, y, w);
  const zMean = FEATURES.map((_, i) => X.reduce((s, x, k) => s + w[k] * x[i], 0) / wSum);
  const pinned = unresolved.map((u, i) => (u ? Math.max(bounds[i][0], Math.min(bounds[i][1], zMean[i])) : null));

  // 6D 결합 최적점 (좌표 상승 — 독립 1D 최적 ≠ 결합 최적)
  const optZ = coordinateAscent(beta, bounds, pinned);
  const optPhysical = fromNormalized(optZ, cropKey);
  // 끝에 붙은 요인은 "여기가 최적"이 아니라 "여기까지밖에 못 봤다"는 뜻이다
  const boundaryTol = 1e-4;
  const atBoundary = optZ.map(
    (z, i) =>
      !unresolved[i] &&
      (Math.abs(z - bounds[i][0]) < boundaryTol || Math.abs(z - bounds[i][1]) < boundaryTol)
  );

  // 표면 민감도 — 최적점을 낸 것과 같은 계수·같은 상자에서 나온다
  const sens = surfaceSensitivity(beta, bounds);
  const sensSum = sens.reduce((a, b) => a + b, 0) || 1;
  const corr = (f: number) => {
    const xf = X.map((x) => x[f]);
    const xm = xf.reduce((s, v, i) => s + w[i] * v, 0) / wSum;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      num += w[i] * (xf[i] - xm) * (y[i] - yMean);
      dx += w[i] * (xf[i] - xm) ** 2;
      dy += w[i] * (y[i] - yMean) ** 2;
    }
    return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
  };
  const sensitivity: RecipeSensitivity[] = FEATURES.map((f, i) => ({
    feature: f,
    label: FEATURE_LABEL[f],
    range: Math.round(sens[i] * 1000) / 1000,
    share: Math.round((sens[i] / sensSum) * 1000) / 1000,
    correlation: Math.round(corr(i) * 100) / 100,
  })).sort((a, b) => b.range - a.range);

  // 현 사이트 평균은 물리 단위 그대로 — 운영자가 계기에서 읽는 값이다
  const recipe: RecipeSetpoint[] = FEATURES.map((f, i) => ({
    feature: f,
    label: FEATURE_LABEL[f],
    optimum: Math.round(optPhysical[f] * 100) / 100,
    current: Math.round((obs.reduce((s, o) => s + o[f], 0) / n) * 100) / 100,
    unit: UNIT[f],
    atBoundary: atBoundary[i],
    curvatureUnresolved: unresolved[i],
  }));

  const top = sensitivity[0];
  const surface = surfaceVerdict(beta);
  const bounded = recipe.filter((r) => r.atBoundary).map((r) => r.label);

  // 주야 진폭이 정상범위 폭을 넘으면 그 사이클의 평균 온도는 대표값이 아니다.
  // 임계값을 따로 정하지 않고 그 품종의 정상범위 폭을 그대로 쓴다 — 진폭이 허용
  // 범위 전체를 훑었다면 평균 하나로 그 사이클을 말할 수 없다.
  const difLimit = 2 * cropScales(cropKey).temp.half;
  const withDif = obs.filter((o) => o.tempDiurnalAmpC !== undefined);
  const diurnalFlaggedShare = withDif.length
    ? Math.round((withDif.filter((o) => (o.tempDiurnalAmpC ?? 0) > difLimit).length / withDif.length) * 1000) / 1000
    : 0;
  const stressDownweightedShare =
    Math.round((w.filter((wi) => wi < 0.5).length / n) * 1000) / 1000;

  const fitPart =
    r2 === null
      ? `${n}개 사이클 학습 — 파라미터 ${NPARAMS}개에 비해 표본이 적어 설명력 판정 불가`
      : `${n}개 사이클 학습(5-fold CV R²=${Math.round(r2 * 100) / 100})`;
  const surfacePart =
    surface === "최대점"
      ? "반응표면이 내부 최대점을 갖는다"
      : surface === "안장점"
        ? "반응표면이 안장이라 표시된 값은 최적점이 아니라 탐색범위의 끝이다"
        : "곡률이 잡히지 않아 최적점을 판정할 수 없다";
  const boundPart = bounded.length ? ` 탐색범위 끝에 붙은 요인: ${bounded.join("·")}.` : "";
  const unresolvedLabels = recipe.filter((r) => r.curvatureUnresolved).map((r) => r.label);
  const curvPart = unresolvedLabels.length
    ? ` 곡률이 잡히지 않아 최적화에서 뺀 요인: ${unresolvedLabels.join("·")} — 이차항 계수의 신뢰구간이 0을 걸쳐 정점 위치를 잡음이 정한다.`
    : "";
  const stressPart = stressDownweightedShare
    ? ` 열 스트레스로 무게를 절반 아래로 내린 관측이 ${Math.round(stressDownweightedShare * 100)}%다 — 그 사이클의 수율은 이 표면 위에 있지 않다.`
    : "";
  const difPart = diurnalFlaggedShare
    ? ` 주야 진폭이 정상범위 폭(${difLimit}℃)을 넘은 관측이 ${Math.round(diurnalFlaggedShare * 100)}%라 온도 권고의 근거가 그만큼 약하다.`
    : "";

  return {
    samples: n,
    sensitivity,
    recipe,
    modelR2: r2 === null ? null : Math.round(r2 * 100) / 100,
    surface,
    stressDownweightedShare,
    diurnalFlaggedShare,
    note: `${fitPart}. 관측범위에서 예측 수율을 가장 크게 움직이는 요인: ${top.label}(폭 ${top.range}kg/㎡, 전체의 ${Math.round(
      top.share * 100
    )}%). 주효과+이차항+쌍상호작용(온도×CO₂·EC×DLI·온도×습도) 다변량 반응표면의 6D 결합 최적점 — ${surfacePart}.${boundPart}${curvPart}${stressPart}${difPart}`,
    _beta: beta,
    _cropKey: cropKey,
  };
}

// ── ③ 갭 분석: 현재 조건 vs 최적 레시피 → 실행 권고 ──────────────────────────
// 요인별 상방을 "이 요인만 옮겼을 때의 차이"로 재면 상호작용 때문에 부분의 합이
// 전체와 맞지 않는다. 화면은 그 둘을 나란히 놓으므로 어긋나면 바로 들킨다.
// 섀플리 분해를 쓰면 Σφ_i = f(전부 최적) − f(전부 현재)가 항등식으로 성립한다.
// 여기서 연합은 "그 요인들만 최적으로 옮긴 상태"이고, 요인 6개라 2^6=64로 정확계산.
export interface RecipeAction {
  label: string;
  current: number;
  target: number;
  direction: "상향" | "하향" | "유지";
  /**
   * 표면 민감도 몫. "이 요인이 표면을 얼마나 움직이나"이고, 아래 상방은
   * "지금 여기서 옮기면 얼마 버나"다. 민감한데 상방이 0이면 이미 최적에 붙어
   * 있다는 뜻 — 둘이 같은 계수에서 나오므로 이 해석이 항상 성립한다.
   */
  sensitivityShare: number;
  /** 섀플리 배분 상방(%). 음수면 그 요인만 따로 옮기는 것이 오히려 손해라는 뜻 */
  predictedYieldUpliftPct: number;
  /** 최적점이 탐색범위 끝이라 권고의 근거가 약한 요인 */
  atBoundary: boolean;
  /** 곡률이 잡히지 않아 조작 지시를 내지 않는 요인 */
  curvatureUnresolved: boolean;
}

export interface RecipeGapReport {
  actions: RecipeAction[];
  totalPotentialUpliftPct: number;
  headline: string;
}

export function recipeGapAnalysis(
  recipe: GrowthRecipe,
  current: Partial<Record<GrowthFeature, number>>
): RecipeGapReport {
  const sensMap = new Map(recipe.sensitivity.map((s) => [s.feature, s.share]));
  const spMap = new Map(recipe.recipe.map((sp) => [sp.feature, sp]));
  const nF = FEATURES.length;

  // 물리 단위로 받아 학습 좌표계로 옮긴다 — _beta는 정규화 좌표의 계수다
  const asObs = (pick: (f: GrowthFeature) => number): GrowthObservation =>
    ({
      ...(Object.fromEntries(FEATURES.map((f) => [f, pick(f)])) as Record<GrowthFeature, number>),
      yield: 0,
    });
  const gapScales = cropScales(recipe._cropKey);
  const currentPhys = (f: GrowthFeature) => current[f] ?? spMap.get(f)?.current ?? 0;
  const optimalPhys = (f: GrowthFeature) => spMap.get(f)?.optimum ?? currentPhys(f);
  const curZ = toNormalized(asObs(currentPhys), recipe._cropKey);
  const optZ = toNormalized(asObs(optimalPhys), recipe._cropKey);

  const beta = recipe._beta;
  const yHatCurrent = beta ? predictRS(beta, curZ) : null;
  const yHatOptimal = beta ? predictRS(beta, optZ) : null;
  // 예측 수율이 0 이하면 비율 자체가 뜻을 잃는다 — 상방을 말하지 않는다
  const scalable = beta && yHatCurrent !== null && yHatCurrent > 0.01;

  // 섀플리 배분: 연합 S = "S에 든 요인만 최적으로 옮긴 상태"
  const shapleyPct = (): number[] => {
    if (!beta || !scalable || yHatCurrent === null) return Array(nF).fill(0);
    const cache = new Map<number, number>();
    const v = (mask: number) => {
      const hit = cache.get(mask);
      if (hit !== undefined) return hit;
      const z = FEATURES.map((_, i) => ((mask >> i) & 1 ? optZ[i] : curZ[i]));
      const val = predictRS(beta, z);
      cache.set(mask, val);
      return val;
    };
    const fact = (k: number) => {
      let r = 1;
      for (let i = 2; i <= k; i++) r *= i;
      return r;
    };
    const nFact = fact(nF);
    const phi = Array(nF).fill(0);
    for (let i = 0; i < nF; i++) {
      for (let mask = 0; mask < 1 << nF; mask++) {
        if ((mask >> i) & 1) continue;
        let s = 0;
        for (let b = mask; b; b >>= 1) s += b & 1;
        phi[i] += ((fact(s) * fact(nF - s - 1)) / nFact) * (v(mask | (1 << i)) - v(mask));
      }
    }
    return phi.map((p) => Math.round((p / yHatCurrent) * 1000) / 10);
  };
  const phiPct = shapleyPct();

  const actions: RecipeAction[] = recipe.recipe
    .map((sp): RecipeAction => {
      const fi = FEATURES.indexOf(sp.feature as GrowthFeature);
      const cur = currentPhys(sp.feature as GrowthFeature);
      const gap = sp.optimum - cur;
      // 계측 잡음 안에서 흔들리는 차이를 조작 지시로 바꾸지 않는다 — 정상범위 반폭의 2%.
      //
      // 데드밴드를 gap에 비례시키면 안 된다. 호출부가 관측 평균을 current로 넘기면
      // gap과 기준폭이 같은 값이 되어 조건이 |gap| < 0.02·|gap|이 되고, gap이 0인
      // 경우를 빼면 절대 참이 되지 않는다 — 문턱이 있는 척만 하고 전부 통과시킨다.
      // 잡음 문턱은 차이의 함수가 아니라 그 요인의 계측 스케일에서 와야 한다.
      const deadband = 0.02 * gapScales[sp.feature as GrowthFeature].half;
      return {
        label: sp.label,
        current: Math.round(cur * 100) / 100,
        target: sp.optimum,
        // 곡률이 안 잡힌 요인은 정점 위치를 잡음이 정한다 — 그 값으로 조작
        // 지시를 내지 않는다
        direction:
          sp.curvatureUnresolved || Math.abs(gap) < deadband ? "유지" : gap > 0 ? "상향" : "하향",
        sensitivityShare: sensMap.get(sp.feature) ?? 0,
        predictedYieldUpliftPct: phiPct[fi],
        atBoundary: sp.atBoundary,
        curvatureUnresolved: sp.curvatureUnresolved,
      };
    })
    .sort((a, b) => b.predictedYieldUpliftPct - a.predictedYieldUpliftPct);

  // 전체 상방 = 현재 → 전부 최적. 섀플리 분해라 부분의 합과 항등으로 맞는다.
  const total =
    scalable && yHatOptimal !== null && yHatCurrent !== null
      ? Math.round(((yHatOptimal - yHatCurrent) / yHatCurrent) * 1000) / 10
      : 0;

  const top = actions[0];
  // 주야 진폭이 큰 관측이 많으면 온도 권고만 근거가 약하다. 다른 요인은 멀쩡하므로
  // 표 전체를 막지 않고 그 줄에만 사실을 붙인다.
  const difWarn =
    recipe.diurnalFlaggedShare > 0.2
      ? ` 온도는 주야 진폭이 큰 사이클이 ${Math.round(recipe.diurnalFlaggedShare * 100)}%라 평균값 권고의 근거가 약하다 — 같은 평균에서도 실제 온도곡선이 다르다.`
      : "";
  return {
    actions,
    totalPotentialUpliftPct: total,
    headline:
      recipe.surface !== "최대점"
        ? `반응표면이 ${recipe.surface}이라 권고를 내지 않는다 — 표시된 값은 최적점이 아니라 탐색범위의 끝이다.`
        : top && top.direction !== "유지"
          ? `${top.label}을(를) ${top.current}${recipe.recipe.find((r) => r.label === top.label)?.unit ?? ""} → ${top.target} ${top.direction}이 최우선 (모델 예측 수율 ${top.predictedYieldUpliftPct >= 0 ? "+" : ""}${top.predictedYieldUpliftPct}%). 전체 최적화 시 ${total >= 0 ? "+" : ""}${total}% 상방.${top.atBoundary ? " 다만 이 요인은 탐색범위 끝이라 더 올릴 여지가 확인되지 않았다." : ""}${difWarn}`
          : `현재 조건이 최적 레시피에 근접 — 유지 권장.${difWarn}`,
  };
}
