// ── 운영 최적화 파라미터 레지스트리 ────────────────────────────────────────
// 요금 단가·배출계수·정산단가·원가가 코드 곳곳에 상수로 흩어져 있으면 "이 숫자
// 어디서 왔나"에 답할 수 없고, 실측이 들어왔을 때 교체할 지점도 찾기 어렵다.
// 값과 함께 근거(basis)를 붙여 한 곳에 모은다.
//
//   고시 — 관보·공시 단가를 그대로 옮긴 값
//   추정 — 공개 자료에서 우리 조건으로 환산한 값
//   가정 — 실측 전까지 쓰는 작업 가정. 확정 시 반드시 교체
//
// 리포트는 이 표를 그대로 노출한다. 절감액을 방어할 때 필요한 건 결과값이 아니라
// 그 값이 어느 가정 위에 서 있는지다.

export type ParamBasis = "고시" | "추정" | "가정";

export interface Param<T> {
  value: T;
  basis: ParamBasis;
  /** 무엇에 쓰이는 값인지 (표에 그대로 표시) */
  label: string;
  source: string;
  asOf: string;
  /** 실측·확정 시 무엇으로 바꾸는지 */
  replaceWith?: string;
}

function p<T>(value: T, meta: Omit<Param<T>, "value">): Param<T> {
  return { value, ...meta };
}

// 2026.4 한전 요금 개편(49년 만의 시간대 개편) 구조 반영:
//  - 낮 11~15시: 태양광 잉여로 경부하성 시간대로 재분류
//  - 저녁 18~21시: 최대부하로 편입
const TOU_GENERAL = [
  110, 110, 110, 110, 110, 110, 110, 110, 110, // 00~08 경부하
  150, 150,                                     // 09~10 중간부하
  130, 130, 130, 130,                           // 11~14 낮 할인(개편 신설)
  150, 150, 150,                                // 15~17 중간부하
  210, 210, 210,                                // 18~20 최대부하(개편 편입)
  150, 150,                                     // 21~22 중간부하
  110,                                          // 23    경부하
];

// 시간대별 계통 탄소집약도 배율 — 낮(태양광 다량)은 배출이 낮고 저녁 피크는 높다.
// TOU 요금과 같은 방향이라, LED를 저렴 시간대로 옮기면 원과 CO2가 함께 준다.
const CARBON_INTENSITY = [
  1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.0, 1.0, 1.0, // 00~08
  0.9, 0.9, 0.75, 0.7, 0.7, 0.75, // 09~14 태양광 피크
  0.9, 1.0, 1.05, 1.25, 1.25, 1.25, // 15~20 저녁 피크
  1.05, 1.0, 1.0, // 21~23
];

export const PARAMS = {
  tariffTouGeneral: p(TOU_GENERAL, {
    basis: "추정",
    label: "시간대별 전력량요금 (일반용 을, 저압)",
    source: "한전 전기요금표 2026.4 개편 구조 기준 근사(원/kWh)",
    asOf: "2026-04",
    replaceWith: "확정 계약종의 고시 단가",
  }),
  tariffFlatAgri: p(Array(24).fill(53) as number[], {
    basis: "추정",
    label: "농사용(을) 평탄 요금",
    source: "한전 농사용(을) 저압 근사(원/kWh)",
    asOf: "2026-04",
    replaceWith: "농사용 적용 확정 시 고시 단가",
  }),
  demandChargePerKw: p(8320, {
    basis: "추정",
    label: "기본요금 단가 (원/kW·월)",
    source: "일반용(을) 저압 기본요금 근사",
    asOf: "2026-04",
    replaceWith: "확정 계약종의 고시 단가",
  }),
  contractPenaltyMultiplier: p(1.5, {
    basis: "가정",
    label: "계약전력 초과 시 위약 배수",
    source: "초과분에 대한 할증 관행을 배수로 단순화",
    asOf: "2026-08",
    replaceWith: "계약서상 초과 요금 조항",
  }),
  gridEmissionFactor: p(0.459, {
    basis: "고시",
    label: "계통 전력 배출계수 (kg CO2/kWh)",
    source: "국가 온실가스 배출계수 (한국 2024 근사)",
    asOf: "2024",
  }),
  carbonIntensityFactor: p(CARBON_INTENSITY, {
    basis: "가정",
    label: "시간대별 탄소집약도 배율 (평균 1.0 정규화)",
    source: "태양광 발전 비중의 일중 패턴을 반영한 작업 가정",
    asOf: "2026-08",
    replaceWith: "전력거래소 시간대별 실측 배출계수",
  }),
  carbonPricePerKg: p(30, {
    basis: "가정",
    label: "탄소 가격 (원/kg CO2)",
    source: "배출권 가격대를 참고한 내부 가격",
    asOf: "2026-08",
  }),
  unitVariableCost: p(550, {
    basis: "가정",
    label: "포기당 변동비 (원)",
    source: "종자 30 + 양액 80 + 배분 전기 250 + 포장·자재 190",
    asOf: "2026-08",
    replaceWith: "1호점 원가 실적",
  }),
  unitSalePrice: p(2000, {
    basis: "추정",
    label: "포기당 직판 단가 (원)",
    source: "도심 직판 엽채류 150g 소매가 근사",
    asOf: "2026-08",
    replaceWith: "실 판매 단가",
  }),
  cropPricePerKg: p(4000, {
    basis: "추정",
    label: "엽채류 산지가 (원/kg)",
    source: "상추 도매 시세 근사",
    asOf: "2026-08",
    replaceWith: "실 판매 단가",
  }),
  drBasicPricePerKwYear: p(43994, {
    basis: "고시",
    label: "수요반응 기본정산 단가 (원/kW·년)",
    source: "전력거래소 공시 단가",
    asOf: "2017",
    replaceWith: "현행 공시 단가 (확인 필요)",
  }),
  drPerformancePricePerKwh: p(100, {
    basis: "추정",
    label: "수요반응 실적정산 단가 (원/kWh)",
    source: "감축 실적 정산 단가 근사",
    asOf: "2017",
    replaceWith: "현행 정산 규칙",
  }),
  targetRoomTempC: p(20, {
    basis: "가정",
    label: "재배실 목표 실온 (℃)",
    source: "엽채류 적정 생육온도 18~22의 중앙",
    asOf: "2026-08",
  }),
  ledHeatFraction: p(0.95, {
    basis: "추정",
    label: "LED 소비전력 중 실내 현열로 남는 비율",
    source: "광합성으로 고정되는 몫(수 %)을 제외한 나머지가 열로 남는다",
    asOf: "2026-08",
    replaceWith: "재배실 열평형 실측",
  }),
  envelopeUaKwPerK: p(0.03, {
    basis: "가정",
    label: "재배실 외피 열관류 UA (kW/K)",
    source: "샌드위치 패널 U 0.3W/㎡K × 외기 접면 100㎡ 근사 (도심 공실은 상당 면이 실내에 면함)",
    asOf: "2026-08",
    replaceWith: "실측 외피 면적·U값",
  }),
  freeCoolingCostPerKwh: p(15, {
    basis: "가정",
    label: "외기냉방으로 열을 버리는 단가 (원/kWh열)",
    source: "외기 도입 시 압축기 대신 급배기 팬 전력만 드는 구간의 근사",
    asOf: "2026-08",
    replaceWith: "환기 팬 소비전력 실측",
  }),
  coolCopDegradationPerK: p(0.02, {
    basis: "가정",
    label: "외기 1℃ 상승당 냉방 제거단가 상승률",
    source: "응축온도 상승에 따른 압축기 COP 저하 관행값(2~3%/K)의 하단",
    asOf: "2026-08",
    replaceWith: "설치 장비의 외기온도별 COP 곡선",
  }),
  co2AssimilationGPerM2H: p(1.8, {
    basis: "추정",
    label: "명기 중 작물 CO2 흡수율 (g/㎡·h, 대기 농도 기준)",
    source: "시설 작물 흡수율 4.8~9.6 kg/h·acre(=1.2~2.4 g/㎡·h)의 중앙값",
    asOf: "2026-08",
    replaceWith: "재배실 CO2 물질수지 실측",
  }),
  demandMeteringThresholdKw: p(20, {
    basis: "고시",
    label: "최대수요전력 계량 적용 계약전력 하한 (kW)",
    source: "계약전력 20kW 이상부터 15분 단위 최대수요전력 제도 적용",
    asOf: "2026-08",
  }),
  heatCreditPerKwh: p(60, {
    basis: "가정",
    label: "LED 폐열의 난방 대체가치 (원/kWh열)",
    source: "히트펌프 COP를 반영한 난방 단가 근사",
    asOf: "2026-08",
  }),
  coolCostPerKwh: p(90, {
    basis: "가정",
    label: "LED 폐열의 냉방 부담 (원/kWh열)",
    source: "냉방 COP를 반영한 제거 단가 근사",
    asOf: "2026-08",
  }),
  co2CostPerKg: p(350, {
    basis: "추정",
    label: "시비용 CO2 단가 (원/kg)",
    source: "액화탄산 벌크 공급가 근사",
    asOf: "2026-08",
    replaceWith: "공급 계약 단가",
  }),
  co2LossRatePerHour: p(0.35, {
    basis: "가정",
    label: "재배실 CO2 시간당 손실률 (환기·누기)",
    source: "밀폐 재배실 환기율 근사",
    asOf: "2026-08",
    replaceWith: "실측 환기율(ACH)",
  }),
  yieldMaxKgM2: p(4.5, {
    basis: "가정",
    label: "㎡당 사이클 포화 수율 (kg)",
    source: "수직농장 엽채류 수율 문헌 범위의 중앙값",
    asOf: "2026-08",
    replaceWith: "1호점 수확 실적",
  }),
  yieldLightK: p(0.08, {
    basis: "가정",
    label: "광량-수율 포화 계수",
    source: "y = ymax(1 − e^(−k·DLI)) 형태의 작업 가정",
    asOf: "2026-08",
    replaceWith: "환경↔수율 회귀 추정치",
  }),
} as const;

export interface ParamRow {
  key: string;
  label: string;
  basis: ParamBasis;
  source: string;
  asOf: string;
  replaceWith?: string;
  /** 배열 파라미터는 값 대신 요약을 넣는다 */
  display: string;
}

// 리포트·API에 그대로 실어 보내는 표.
export function paramTable(): ParamRow[] {
  return Object.entries(PARAMS).map(([key, param]) => {
    const v = param.value as number | number[];
    return {
      key,
      label: param.label,
      basis: param.basis,
      source: param.source,
      asOf: param.asOf,
      replaceWith: (param as { replaceWith?: string }).replaceWith,
      display: Array.isArray(v)
        ? `24시간 배열 (${Math.min(...v)}~${Math.max(...v)})`
        : String(v),
    };
  });
}

// 가정에 기대고 있는 값이 몇 개인지 — 리포트 신뢰도의 요약 지표.
export function paramConfidence(): {
  total: number;
  byBasis: Record<ParamBasis, number>;
  assumedShare: number;
} {
  const rows = paramTable();
  const byBasis = { 고시: 0, 추정: 0, 가정: 0 } as Record<ParamBasis, number>;
  for (const r of rows) byBasis[r.basis] += 1;
  return {
    total: rows.length,
    byBasis,
    assumedShare: Math.round((byBasis["가정"] / rows.length) * 100) / 100,
  };
}
