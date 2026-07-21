// ── 스마트팜 오픈데이터 어댑터 ──────────────────────────────────────────────
// 최적화 엔진의 입력을 "실제 공개 데이터"로 갈아끼우기 위한 경계면.
//
// 데이터 소스 (실 API 연결 지점):
//  - 스마트팜코리아 빅데이터 플랫폼 (농정원): 온실 환경·생육 데이터 OpenAPI
//    https://www.smartfarmkorea.net → 빅데이터 플랫폼 → OpenAPI (발급키 필요)
//  - 공공데이터포털(data.go.kr): 농진청 시설원예 환경 데이터셋
//
// 현재는 위 데이터셋의 스키마를 따르는 번들 샘플(prisma/opendata-sample.json)을
// 읽는다. 실 데이터 전환 = fetchOpenData()의 fetch 부분만 교체 (env: SMARTFARM_API_KEY).
// 샘플 값은 실측이 아니라 스키마 검증용 표본이며, 데모 전 실제 다운로드 파일로
// 교체하는 것을 전제로 한다.

import { IoTReading } from "./iot-health";

// 스마트팜코리아 온실 환경 데이터의 대표 필드 (데이터셋별 명칭 차이는 mapRecord에서 흡수)
export interface OpenEnvRecord {
  measDt: string; // 측정시각 ISO
  innerTemp: number; // 내부온도 ℃
  innerHum: number; // 내부습도 %
  co2: number; // ppm
  lightIntensity: number; // lux (또는 일사량 환산)
  ph: number; // 양액 pH
}

export function mapRecordToReading(r: OpenEnvRecord): IoTReading {
  return {
    temperature: r.innerTemp,
    humidity: r.innerHum,
    co2Level: r.co2,
    lightIntensity: r.lightIntensity,
    phLevel: r.ph,
  };
}

// 데이터 소스 우선순위: ① 실데이터(opendata-real.json — 스마트팜코리아 정형
// 데이터셋 "골든플래닛" 딸기 온실 농가 NSG098_01의 실측 환경 시계열을 long→wide
// 피벗 변환한 것) → ② 스키마 샘플(폴백).
// 실데이터 갱신 절차: smartfarmkorea.net 정형 데이터셋에서 zip 다운로드(로그인
// 불요 — GET /structuredDataset/fileDownload.do?type=ent&fileName=...) →
// 장비코드(FG-EI-TI 내부온도/FG-EI-HI 내부습도/FG-EI-CI CO2/FG-EI-IS 일사량/
// FG-EL-PL 토양pH) 기준 피벗 → 이 파일 교체.
// 주의: 실데이터는 딸기 온실(일사량 W/m², 토양 pH)이라 새싹삼 수경 도메인과
// 품목이 다르다 — 알고리즘 데모용 실측 시계열이며, 품목별 정상범위(HEALTHY_RANGES)는
// 운영 품목에 맞춰 교체하는 지점.
export async function fetchOpenData(): Promise<OpenEnvRecord[]> {
  try {
    const real = await import("../../prisma/opendata-real.json");
    return (real.default ?? real) as OpenEnvRecord[];
  } catch {
    const sample = await import("../../prisma/opendata-sample.json");
    return (sample.default ?? sample) as OpenEnvRecord[];
  }
}

// 일별 판매 시계열 (수요 예측 입력) — 운영 시 무인매장 POS 정산 데이터로 교체.
export interface SalesRecord {
  salesDt: string; // YYYY-MM-DD
  units: number; // 판매 포기 수
}

export async function fetchSalesData(): Promise<SalesRecord[]> {
  const sample = await import("../../prisma/sales-sample.json");
  return (sample.default ?? sample) as SalesRecord[];
}
