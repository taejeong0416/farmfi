# CLAUDE.md

FarmFi — 도심 공실을 스마트팜 기반 24시간 신선채소 매장으로 전환하는 통합 지원 플랫폼 (PNU 창의융합AI해커톤 2026).
공실에 민간 투자금을 모아 설비를 놓고, AI 검증에 연동된 마일스톤 게이트가 조성자금을 단계 집행한다.
기획 정본은 `docs/service-plan.md`, 사람용 가이드는 `CONTRIBUTING.md`, 문서 작성 규칙은 `docs/README.md` 참고.

## 현재 상태
계획한 화면 62개와 기능 개발은 다 끝났다. 무엇이 실제로 도는지는 `README.md` 3장,
무엇을 만들기로 했는지는 `docs/spec/feature-spec.md`(웹)·`docs/spec/app-feature-spec.md`(앱)를 본다.

**여기서 하는 일은 웹(`frontend/`)이다.** 운영자 앱(`app/`)과 앱만 호출하는 API는 다른 담당이 맡는다 — 요청받지 않는 한 건드리지 않는다. 앱과 웹이 같은 서버·같은 DB를 쓰므로 `prisma/schema.prisma`는 양쪽이 함께 쓴다.

## 디자인
Figma가 기준이다. 원본은 `design/*.fig`, 화면별 좌표·색·폰트 덤프는 `design/screens/`.

`design/farmfi-web.fig`는 디자인 최종본이다.

색은 아래를 쓴다.
```
ink #1A1A1A · body #4A4A4A · muted #8A8A8A
line #E5E5E3 · line-soft #EDEDEB · surface #F1F4F2
brand #14542E · danger #DC2626
accent-investor #207349 · accent-operator #8C6114
```
- 값은 `.fig`에서 그대로 뽑은 것이다. Figma와 코드가 갈리면 Figma가 맞다.
- 제3자 브랜드 로고(B-05 결제수단)는 원본 색을 쓴다.

## 구조
- `frontend/` — Next.js 14 (App Router) + Prisma + API Routes (웹 + 백엔드)
- `app/` — Expo React Native 운영자 앱
- `contracts/` — Foundry (Escrow · FarmToken · Dividend · RoundGate)
- `docs/` — 공유 문서 (feature-spec / app-feature-spec / dev-log)

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
