// 기간 조회 창(rolling window)의 기준점을 "데이터 최신 시각"에 맞춘다.
//
// 시드는 실행 시점 기준 상대 날짜로 데이터를 넣는다(예: now-14일 ~ now). 반면 조회는
// 현재 시각에서 역산한 창을 쓰므로, 시드 후 창 길이보다 오래 지나면 두 구간이 겹치지
// 않아 결과가 0건이 된다. 이때 API는 정상적으로 200을 반환하고 화면만 비어서, 데이터가
// 없는 것인지 기능이 없는 것인지 구분되지 않는다.
//
// 최신 레코드를 창의 끝점으로 삼으면 데이터가 있는 한 창이 항상 데이터를 덮는다.
// 데이터가 계속 들어오는 상태에서는 끝점이 곧 현재라 기존 동작과 같다.

const DAY_MS = 24 * 60 * 60 * 1000;

export type DataWindow = {
  /** 조회 하한 (gte) */
  since: Date;
  /** 창의 끝점 = 데이터 최신 시각. 화면은 이 값을 '데이터 기준일'로 밝힌다. */
  dataAsOf: string | null;
  /** 기준점이 현재가 아님 — 화면이 기준일을 표기해야 하는 상태. */
  stale: boolean;
};

export function resolveDataWindow(
  latest: Date | null | undefined,
  days: number
): DataWindow {
  const now = Date.now();
  // 미래 시각 레코드는 기준점으로 쓰지 않는다.
  const anchor = latest ? Math.min(latest.getTime(), now) : now;
  return {
    since: new Date(anchor - days * DAY_MS),
    dataAsOf: latest ? latest.toISOString() : null,
    stale: now - anchor > DAY_MS,
  };
}
