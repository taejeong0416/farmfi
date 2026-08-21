# CLAUDE.md

FarmFi — 토큰증권(STO) 활용 미니팜 자금집행 웹플랫폼 (PNU 창의융합AI해커톤 2026).
도심 유휴공실을 스마트팜 매장으로 전환하는 자금을 STO로 조달하고, AI 검증에 연동된 마일스톤 게이트가 단계 집행한다.
사람용 가이드는 `CONTRIBUTING.md`, 문서 작성 규칙은 `docs/README.md` 참고.

## 진행 중인 작업
`docs/build-plan.md` — 웹 화면 62개 + 기능 개발. **체크박스가 진행 상황의 정본이다.**
작업을 이어받을 때는 이 파일에서 체크 안 된 첫 항목부터 시작하고, 단위를 끝내면 체크·커밋한다.
Phase A~K 체크는 잠정 `.fig` 기준으로 끝났다는 뜻이고, 최종 디자인 반영은 Phase N이 남아있다.

**여기서 하는 일은 웹(`frontend/`)이다.** 운영자 앱(`app/`)과 앱만 호출하는 API는 다른 담당이 맡는다 — 요청받지 않는 한 건드리지 않는다. 앱과 웹이 같은 서버·같은 DB를 쓰므로 `prisma/schema.prisma`는 양쪽이 함께 쓴다.

## 디자인
Figma가 기준이다. 원본은 `design/*.fig`, 화면별 좌표·색·폰트 덤프는 `design/screens/`.

현재 `design/*.fig`는 **잠정본**이다. 지금까지 옮긴 화면은 전부 이 잠정본 기준이라 최종 디자인과 다를 수 있다. 최종본이 들어오면 `docs/build-plan.md` Phase N(교체·대조·재검증)을 따른다.

색은 아래를 기본으로 쓴다.
```
ink #1A1A1A · body #4A4A4A · muted #8A8A8A
line #E5E5E3 · line-soft #EDEDEB · surface #F2F2F0
brand #14542E · brand-soft #EAF6EE · danger #A34A3D
```
- Figma에 남아있는 노랑·파랑과 연한 틴트 배경은 쓰지 않는다. 치환표는 `docs/figma-color-map.md`.
- 상태를 여러 색으로 등급 매기지 않는다. 글자로 말한다.
- 제3자 브랜드 로고(B-05 결제수단)는 원본 색을 쓴다.
- 웹과 앱이 같은 색을 쓴다.

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
