// 백엔드 API 베이스 URL.
// 실기기(USB)에서는 `adb reverse tcp:3000 tcp:3000` 실행 시 기기의 localhost가
// PC로 매핑되어 아래 기본값이 그대로 동작한다. 또는 PC의 LAN IP로 바꾸거나
// EXPO_PUBLIC_API_URL 환경변수로 지정할 수 있다 (예: http://192.168.0.10:3000).
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
