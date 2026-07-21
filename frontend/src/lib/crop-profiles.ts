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
  // 검증·이상탐지용 도메인 정상범위
  healthyRanges: {
    temperature: [number, number];
    humidity: [number, number];
    co2Level: [number, number];
    lightIntensity: [number, number]; // lux (참고)
    phLevel: [number, number]; // 양액 pH
  };
  dliTarget: number; // mol/m²/day — 광주기 최적화의 제약
  ppfd: number; // μmol/m²/s — LED 설계 광량
  ecTarget: [number, number]; // dS/m 양액 EC
  cycleDays: number; // 재배 사이클 (파종~수확)
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
    ecTarget: [1.2, 1.8],
    cycleDays: 28,
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
    ecTarget: [1.6, 2.2],
    cycleDays: 35,
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
    ecTarget: [2.0, 3.5],
    cycleDays: 100,
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
    ecTarget: [1.0, 1.6],
    cycleDays: 14,
    role: "premium",
  },
};

export const DEFAULT_CROP = "leafy";

export function getCrop(key?: string): CropProfile {
  return CROP_PROFILES[key ?? DEFAULT_CROP] ?? CROP_PROFILES[DEFAULT_CROP];
}
