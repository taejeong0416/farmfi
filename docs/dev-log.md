# 개발 로그 (Dev Log)

> 진행상황·결정사항·인수인계 기록. **최신 항목을 맨 위에 추가(append)**한다. 이전 내용은 덮어쓰지 않는다.
> 날짜 형식: `## YYYY-MM-DD — 작성자`

---

## 2026-06-07 (2) — 박태정

### 한 일
- Prisma 7 빌드 막힘 **해결** — driver adapter(`@prisma/adapter-pg`) 방식으로 셋업 완성. `tsc --noEmit` 에러 0개.
- 방향 변경 메모: 처음엔 클래식 generator 복귀(A안)로 가려 했으나, 프로젝트가 이미 어댑터 방식(스키마에서 url 제거 + `prisma.config.ts`)으로 셋업돼 있어 **그 방향을 완성하는 쪽**으로 바꿈.

### 해결됨 (이전 "미해결" 항목)
- ✅ `new PrismaClient()` 인자 누락 / import 경로 / tsconfig target / `Set` 순회 — 전부 해결.

### 남음
- 런타임 DB 연결은 실제 `DATABASE_URL`로 1회 확인 필요 (tsc는 통과, 실연결은 미검증).
- 프론트 기반 세팅(패키지·shadcn·wagmi), 컨트랙트 Amoy 배포는 그대로 대기.

---

## 2026-06-07 — 박태정

### 한 일
- `docs/api-spec.md` 작성 — API 15개 요청/응답 명세 (실제 route.ts 코드 기준, 공유·갱신용)
- `plan.md`(구 세부플랜.md)에 `L1-11. 실서비스 확장 항목` 추가 (인증/결제/KYC 등 — 해커톤 이후 개발, 중요도는 높음)
- 백엔드 버그 3개 수정:
  - `verify` → AI API 호출 키 `image` → `imageBase64` (실검증이 항상 실패하던 버그)
  - `detect-anomaly`: `prisma.ioTData`→`iotData`, `createdAt`→`recordedAt`
  - `demo/step`: `milestoneType` seq별 영문 enum 매핑
- `.gitignore`에 `.env` 추가 (시크릿 커밋 방지)
- Prisma 임포트 경로 `@/generated/prisma` → `@/generated/prisma/client` (모듈 해석 에러 해결)
- 팀 공유 문서 체계 수립 (이 로그 + `docs/README.md` 인덱스, 백엔드 보고서 docs/로 이동)

### 결정
- 문서 운영 방식: **용도별 분리 + git 아카이브** (레퍼런스는 제자리 갱신, 진행상황은 이 로그에 append, 수동 아카이빙 X)
- 도커 미사용 확정 — Vercel + Supabase 조합 유지
- Prisma 빌드 문제는 **A안(`prisma-client-js` generator로 전환)**으로 처리하기로 결정 → 다음 작업

### 미해결 / 다음 할 일
- ⚠️ **빌드 막힘**: Prisma 7 새 generator라 `new PrismaClient()`에 인자 필요. → `schema.prisma` generator를 `prisma-client-js`로 변경 + `tsconfig` target 추가 예정 (detect-anomaly의 `Set` 순회 에러도 같이 해결됨)
- 프론트 기반 세팅(패키지 설치, shadcn, wagmi) — 프론트 담당 착수 가능
- 컨트랙트 Amoy 미배포 → 온체인 응답 `txHash`는 아직 전부 `null`
