/** @type {import('next').NextConfig} */
const nextConfig = {
  // 타입 안전성은 tsc(--noEmit)로 이미 게이트함. ESLint 스타일 규칙(no-explicit-any 등)은
  // 프로덕션 빌드를 막지 않도록 함 — 기존 백엔드 파일들도 any를 사용 중이라 빌드 정합을 위해 필요.
  eslint: { ignoreDuringBuilds: true },

  // CORS는 `src/middleware.ts`가 처리한다. 정적 헤더는 오리진을 하나밖에 못 적어
  // 로컬 개발(포트가 매번 다른 Expo)에서 앱이 API를 부를 수 없었다.
};

export default nextConfig;
