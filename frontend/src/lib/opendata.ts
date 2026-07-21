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

// 실 API 전환 지점 — 현재는 번들 샘플 로드.
// 전환 예: const res = await fetch(`${BASE}?serviceKey=${process.env.SMARTFARM_API_KEY}&...`)
export async function fetchOpenData(): Promise<OpenEnvRecord[]> {
  const sample = await import("../../prisma/opendata-sample.json");
  return (sample.default ?? sample) as OpenEnvRecord[];
}
