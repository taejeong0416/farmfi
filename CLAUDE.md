# CLAUDE.md

FarmFi — 도심 빈 공간 스마트팜 STO 플랫폼 (PNU 창의융합AI해커톤 2026).
사람용 가이드는 `CONTRIBUTING.md`, 문서 작성 규칙은 `docs/README.md` 참고.

## 구조
- `frontend/` — Next.js 14 (App Router) + Prisma + API Routes + wagmi/viem
- `contracts/` — Foundry 스마트컨트랙트 (Polygon Amoy 테스트넷)
- `docs/` — 공유 문서 (plan / api-spec / dev-report / dev-log)

## 명령어 (frontend/)
- 개발: `npm run dev`
- Prisma: `npm run prisma:generate`, `npm run prisma:push`, `npm run seed`, `npm run seed:iot`
- 빌드: `npm run build`
- 컨트랙트 (contracts/): `forge build`, `forge test`

## 주의 (gotcha)
- **Prisma 7 driver adapter**: `new PrismaClient()` 무인자 ❌. `PrismaPg` 어댑터를 주입해야 함 — `src/lib/db.ts` 참고. datasource url은 schema가 아니라 `prisma.config.ts`에 있음.
- **온체인 미연동**: 청약/검증/트랜치/배당 API 응답의 `txHash`는 현재 전부 `null` (컨트랙트 Amoy 배포 전).
- **인프라**: 도커 안 씀. Vercel + Supabase(PostgreSQL).
- **환경변수**: 필요 키 목록은 `CONTRIBUTING.md` 참고.

## 작업 규칙
- 커밋: 하나의 논리가 **settled**(빌드 통과 + 더 안 고칠 상태)됐을 때 한 번. 편집마다 ❌, 끝에 몰아서 ❌, `git add .` ❌.
- 메시지: `feat:`/`fix:`/`docs:`/`chore:` 접두. 무관한 변경 섞지 않기.
- 문서: `docs/README.md` 규칙 준수 (레퍼런스=제자리 갱신 / 기록=dev-log append).
