/**
 * 되돌아갈 경로를 쿼리로 받을 때 쓰는 검사.
 *
 * 앱 내부 경로만 통과시킨다. `//evil.com`은 브라우저가 프로토콜 상대 URL로 읽어
 * 외부로 나가므로 `/`로 시작한다는 것만으로는 부족하다.
 */
export function safeNext(value: string | string[] | undefined): string | undefined {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith("/") || next.startsWith("//")) return undefined;
  return next;
}

/** 다음 화면으로 `next`를 넘길 때 쓰는 경로 조립. next가 없으면 경로만 준다. */
export function withNext(path: string, next?: string): string {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}
