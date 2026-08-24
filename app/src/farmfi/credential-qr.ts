/**
 * 보증서 QR 페이로드에서 번호를 꺼낸다 (M-02).
 *
 * 웹 보증서 화면이 번호를 그대로 담을 수도, 링크에 실을 수도 있다. 어느 쪽이
 * 올지 정해두지 않고 둘 다 받는다 — QR 생성 쪽이 바뀌어도 앱을 고치지 않는다.
 *
 * react-native를 import하지 않는 순수 모듈로 둔다. 화면 파일 안에 두면 노드에서
 * 불러올 수 없어 테스트가 불가능하다.
 */
export function credentialNoFrom(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  const fromQuery = text.match(/[?&]credentialNo=([^&\s]+)/i);
  if (fromQuery) return decodeURIComponent(fromQuery[1]).trim() || null;

  const fromPath = text.match(/\/certificates?\/([^/?\s]+)/i);
  if (fromPath) return decodeURIComponent(fromPath[1]).trim() || null;

  // 링크가 아니면 번호 자체로 본다. 공백이 섞인 값은 QR 오탐이다.
  return /\s/.test(text) ? null : text;
}
