// 백엔드 API 베이스 URL.
// 우선순위: EXPO_PUBLIC_API_URL(주입값) → 개발 빌드는 localhost → 배포 빌드는 프로덕션 웹.
// localhost를 무조건 폴백으로 쓰면 스토어/EAS 빌드에서 모니터링 화면이 항상 실패하므로
// 개발(NODE_ENV !== "production") 전용으로 가둔다.
// 실기기(USB) 개발은 `adb reverse tcp:3000 tcp:3000`으로 기기 localhost를 PC에 매핑하거나,
// EXPO_PUBLIC_API_URL에 PC의 LAN IP를 지정한다 (예: http://192.168.0.10:3000).
const PRODUCTION_API_URL = "https://farmfi-web.vercel.app";
const DEV_API_URL = "http://localhost:3000";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  (process.env.NODE_ENV === "production" ? PRODUCTION_API_URL : DEV_API_URL);
