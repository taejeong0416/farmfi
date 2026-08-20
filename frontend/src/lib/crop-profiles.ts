// ── 작물 프로파일 (단일 진실 공급원) ────────────────────────────────────────
// 최적화·검증에 쓰는 품목별 파라미터를 한 곳에 모은다. 주력 = 엽채류(상추·바질),
// 선택 = 방울토마토, 상방 = 마이크로그린.
//
// 파라미터 근거:
//  - 엽채류/상추: arXiv 2507.21669(LSTM-MPC 상추), 2410.23793(Economic MPC 상추),
//    RDA 시설상추 재배 지침. 상추가 실내 수직농장 상업 재배의 표준 품목.
//  - DLI(Daily Light Integral, mol/m²/day): 광주기가 아니라 "하루 총 광량"이 생육의
//    농학적 목표다. DLI만 충족하면 언제 켜든 생육이 같으므로, 시간대 요금 최적화의
//    자유도가 농학적으로 정당화된다 — 우리 전력 절감의 핵심 논거.
//  - PPFD(μmol/m²/s): LED 광합성유효광량자속밀도. DLI = PPFD × 3600 × 광시간 / 1e6.

export interface CropProfile {
  key: string;
  label: string;
  // 검증·이상탐지용 도메인 정상범위 (= 농학 최적대. 이탈 = "작물에 불리", 고장은 아님)
  healthyRanges: {
    temperature: [number, number];
    humidity: [number, number];
    co2Level: [number, number];
    lightIntensity: [number, number]; // lux (참고)
    phLevel: [number, number]; // 양액 pH
  };
  dliTarget: number; // mol/m²/day — 광주기 최적화의 제약
  ppfd: number; // μmol/m²/s — LED 설계 광량(상시 운전점)
  maxPpfd: number; // μmol/m²/s — LED 정격 상한. 디밍 헤드룸의 끝이며, 광량을
  // 시간에 압축할 때 넘을 수 없는 물리 한계. 설비 사양 확정 시 교체하는 지점.
  maxPhotoperiodH: number; // 추대·연속광 장해를 피하는 최대 명기(h)
  minDarkH: number; // 생체리듬 유지에 필요한 최소 연속 암기(h)
  ecTarget: [number, number]; // dS/m 양액 EC
  cycleDays: number; // 재배 사이클 (파종~수확)
  baseTempC: number; // GDD 기저온도 — 이 온도 이하에서는 생장이 멈춘다
  targetGdd: number; // 수확까지 필요한 누적 적산온도 (℃·day)
  role: "primary" | "optional" | "premium";
}

export const CROP_PROFILES: Record<string, CropProfile> = {
  leafy: {
    key: "leafy",
    label: "엽채류(상추)",
    healthyRanges: {
      temperature: [18, 24],
      humidity: [60, 80],
      co2Level: [400, 1200],
      lightIntensity: [0, 30000],
      phLevel: [5.5, 6.5],
    },
    dliTarget: 15, // 상추 권장 12~17
    ppfd: 220,
    maxPpfd: 350,
    maxPhotoperiodH: 16, // 장일 추대 회피
    minDarkH: 6,
    ecTarget: [1.2, 1.8],
    cycleDays: 28,
    baseTempC: 4, // 상추 기저온도 4℃ (엽채류 저온성)
    targetGdd: 504, // 22℃ 정상운전 × 28일 = (22-4)×28
    role: "primary",
  },
  basil: {
    key: "basil",
    label: "바질(허브)",
    healthyRanges: {
      temperature: [20, 26],
      humidity: [55, 75],
      co2Level: [400, 1200],
      lightIntensity: [0, 35000],
      phLevel: [5.5, 6.5],
    },
    dliTarget: 16,
    ppfd: 250,
    maxPpfd: 400,
    maxPhotoperiodH: 18,
    minDarkH: 5,
    ecTarget: [1.6, 2.2],
    cycleDays: 35,
    baseTempC: 10, // 바질 기저온도 10℃ (고온성 허브)
    targetGdd: 455, // 23℃ × 35일
    role: "primary",
  },
  cherryTomato: {
    key: "cherryTomato",
    label: "방울토마토",
    healthyRanges: {
      temperature: [18, 26],
      humidity: [60, 80],
      co2Level: [400, 1000],
      lightIntensity: [0, 45000],
      phLevel: [5.5, 6.5],
    },
    dliTarget: 24, // 과채류라 광 요구 큼
    ppfd: 350,
    maxPpfd: 500,
    maxPhotoperiodH: 17, // 연속광 장해 회피
    minDarkH: 6,
    ecTarget: [2.0, 3.5],
    cycleDays: 100,
    baseTempC: 10, // 토마토 기저온도 10℃ (관행 적산온도 기준)
    targetGdd: 1200, // 22℃ × 100일
    role: "optional",
  },
  microgreen: {
    key: "microgreen",
    label: "마이크로그린",
    healthyRanges: {
      temperature: [18, 24],
      humidity: [50, 70],
      co2Level: [400, 1000],
      lightIntensity: [0, 25000],
      phLevel: [5.5, 6.5],
    },
    dliTarget: 10, // 짧은 사이클·저광
    ppfd: 180,
    maxPpfd: 300,
    maxPhotoperiodH: 20, // 수확 빠름, 관대
    minDarkH: 4,
    ecTarget: [1.0, 1.6],
    cycleDays: 14,
    baseTempC: 4,
    targetGdd: 238, // 21℃ × 14일
    role: "premium",
  },
};

export const DEFAULT_CROP = "leafy";

export function getCrop(key?: string): CropProfile {
  return CROP_PROFILES[key ?? DEFAULT_CROP] ?? CROP_PROFILES[DEFAULT_CROP];
}

// ── 품목 → 프로파일 매핑 ─────────────────────────────────────────────────────
// DB의 Product는 이름(상추·루꼴라·바질)과 category(leafy·herb)만 갖는다. 재배 파라미터는
// 이름이 더 구체적이므로 이름 우선, 없으면 category로 떨어뜨린다.
const CROP_BY_NAME: { match: string; key: string }[] = [
  { match: "토마토", key: "cherryTomato" },
  { match: "바질", key: "basil" },
  { match: "마이크로", key: "microgreen" },
  { match: "새싹", key: "microgreen" },
];

export function cropKeyFor(productName?: string, category?: string): string {
  if (productName) {
    const hit = CROP_BY_NAME.find((c) => productName.includes(c.match));
    if (hit) return hit.key;
  }
  if (category === "herb") return "basil";
  if (category && CROP_PROFILES[category]) return category;
  return DEFAULT_CROP;
}

// ── 두 개의 밴드: 농학 최적대 vs 설비 고장 게이트 ────────────────────────────
// 판정이 하나뿐이면 "작물에 조금 불리함"과 "설비가 죽었음"이 같은 경고가 된다.
// 둘은 조치도 긴급도도 다르므로 밴드를 나누되, 출처는 healthyRanges 하나로 둔다.
//   · 최적대 이탈  → 주의. 제어루프가 setpoint를 추종하며 스스로 되돌린다.
//   · 고장 게이트 이탈 → 심각. 액추에이터가 물리적으로 못 따라간다는 뜻이라 사람이 간다.
// 여유폭은 제어루프가 정상 동작할 때 나타나는 오버슈트·외란 진폭의 상한이다
// (control-loop.ts의 램프율·최소가동시간 제약 하에서 관측되는 범위).
const FAULT_MARGIN: Record<
  keyof CropProfile["healthyRanges"],
  [number, number]
> = {
  temperature: [3, 4], // ℃ — 냉방 정지 시 상승이 하강보다 빠르다
  humidity: [15, 10], // %
  co2Level: [100, 400], // ppm — 밸브 고착은 과다 쪽으로 크게 튄다
  lightIntensity: [0, 15000], // lux — 하한 게이트는 없다(DLI로 판정)
  phLevel: [0.5, 0.5],
};

/** 설비 고장 판정용 밴드 — 농학 최적대를 여유폭만큼 넓힌다. */
export function faultRanges(
  cropKey?: string
): Record<keyof CropProfile["healthyRanges"], [number, number]> {
  const r = getCrop(cropKey).healthyRanges;
  const widen = (
    key: keyof CropProfile["healthyRanges"]
  ): [number, number] => {
    const [lo, hi] = r[key];
    const [dLo, dHi] = FAULT_MARGIN[key];
    return [Math.max(0, lo - dLo), hi + dHi];
  };
  return {
    temperature: widen("temperature"),
    humidity: widen("humidity"),
    co2Level: widen("co2Level"),
    lightIntensity: widen("lightIntensity"),
    phLevel: widen("phLevel"),
  };
}

// ── 광량 환산 ────────────────────────────────────────────────────────────────
// 백색 LED 근사: 1 lux ≈ 0.015 μmol/m²/s PPFD. 스펙트럼에 따라 달라지므로
// 조도계·PAR센서 병행 계측이 들어오면 교체하는 지점.
export const LUX_TO_PPFD = 0.015;

/** lux를 지속시간(h)만큼 적산해 DLI 기여분(mol/m²)으로 환산한다. */
export function luxToDli(lux: number, hours: number): number {
  return (lux * LUX_TO_PPFD * 3600 * hours) / 1e6;
}
