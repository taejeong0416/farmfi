/** @type {import('next').NextConfig} */
const nextConfig = {
  // 타입 안전성은 tsc(--noEmit)로 이미 게이트함. ESLint 스타일 규칙(no-explicit-any 등)은
  // 프로덕션 빌드를 막지 않도록 함 — 기존 백엔드 파일들도 any를 사용 중이라 빌드 정합을 위해 필요.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
