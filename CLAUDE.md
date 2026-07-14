# CLAUDE.md

FarmFi — 도심 유휴공간 공실전환 창업 지원 인프라 (PNU 창의융합AI해커톤 2026).
사람용 가이드는 `CONTRIBUTING.md`, 문서 작성 규칙은 `docs/README.md` 참고.

## 구조
- `frontend/` — Next.js 14 (App Router) + Prisma + API Routes
- `docs/` — 공유 문서 (기획안 v18 / 피벗 실행계획 / api-spec / dev-log)

## 명령어 (frontend/)
- 개발: `npm run dev`
- Prisma: `npm run prisma:generate`, `npm run prisma:push`, `npm run seed`
- 빌드: `npm run build` (로컬 EISDIR 이슈 — 아래 gotcha)

## 주의 (gotcha)
- **Prisma 7 driver adapter**: `new PrismaClient()` 무인자 ❌. `PrismaPg` 어댑터를 주입해야 함 — `src/lib/db.ts` 참고. datasource url은 schema가 아니라 `prisma.config.ts`에 있음.
- **DB 마이그레이션(DDL)**: `prisma db push`는 **세션 pooler(5432)** 필요. 일반 `DATABASE_URL`은 트랜잭션 pooler(6543)라 DDL은 `--url`로 5432 오버라이드. 시드(DML)는 6543으로 OK. 무료플랜 일시정지 시 Supabase에서 Restore.
- **빌드 EISDIR**: 로컬(Windows, 한글 경로 `D:\해커톤`)에서 `next build`가 readlink EISDIR로 실패. 검증은 `tsc --noEmit` + `next dev`로. 프로덕션 빌드는 Vercel(Linux).
- **인프라**: 도커 안 씀. Vercel + Supabase(PostgreSQL).
- **환경변수**: 필요 키 목록은 `CONTRIBUTING.md` 참고.

## 작업 규칙
- 커밋: 하나의 논리가 **settled**(타입/렌더 통과 + 더 안 고칠 상태)됐을 때 한 번. 편집마다 ❌, 끝에 몰아서 ❌, `git add .` ❌.
- 메시지: `feat:`/`fix:`/`docs:`/`chore:` 접두. 무관한 변경 섞지 않기.
- 문서: `docs/README.md` 규칙 준수 (레퍼런스=제자리 갱신 / 기록=dev-log append).
