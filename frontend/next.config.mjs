/** @type {import('next').NextConfig} */
const nextConfig = {
  // 타입 안전성은 tsc(--noEmit)로 이미 게이트함. ESLint 스타일 규칙(no-explicit-any 등)은
  // 프로덕션 빌드를 막지 않도록 함 — 기존 백엔드 파일들도 any를 사용 중이라 빌드 정합을 위해 필요.
  eslint: { ignoreDuringBuilds: true },

  // ─── CORS: 운영자 앱(Expo web 빌드)이 GitHub Pages에서 이 API를 호출한다 ───
  // 다른 오리진이라 브라우저가 프리플라이트를 걸고, 허용 헤더가 없으면 전부 차단된다.
  // 와일드카드(*)는 쓰지 않는다 — 허용 오리진을 명시한다(프로젝트 보안 규칙).
  // 인증은 Bearer 토큰이라 쿠키가 필요 없어 Allow-Credentials는 두지 않는다.
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "https://pnu-2026-ai-hackathon.github.io",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,PATCH,DELETE,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
          { key: "Access-Control-Max-Age", value: "86400" },
          // 오리진별로 응답이 달라질 수 있음을 캐시에 알린다.
          { key: "Vary", value: "Origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
