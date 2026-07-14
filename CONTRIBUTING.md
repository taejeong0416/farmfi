# Contributing

FarmFi 개발 가이드.

## 기술 스택
- **프론트/백엔드**: Next.js 14 (App Router + API Routes), TypeScript
- **DB**: PostgreSQL (Supabase) + Prisma ORM (Prisma 7, driver adapter)
- **인증**: 이메일 + 비밀번호 (bcrypt), jose 세션(JWT)
- **이상 탐지**: Z-score + 도메인 정상범위 판정 (자체 구현 — 외부 AI API 미사용)
- **배포**: Vercel (도커 미사용)

## 개발 환경 셋업
1. 클론 후 `cd frontend && npm install`
2. `frontend/.env` 생성 — 아래 키 설정:

   | 키 | 용도 |
   |---|---|
   | `DATABASE_URL` | Supabase PostgreSQL 연결 문자열 (트랜잭션 pooler 6543) |
   | `JWT_SECRET` | 세션(JWT) 서명 키 |

3. `npm run prisma:generate` → `npm run prisma:push` → `npm run seed`
   - `prisma db push`(DDL)는 **세션 pooler(5432)** 필요 — 일반 URL이 6543(트랜잭션 pooler)이면 `--url`로 5432 오버라이드. 시드(DML)는 6543으로 OK.
4. `npm run dev` → http://localhost:3000
   - 시드 로그인 계정: `operator@farmfi.test` / `admin@farmfi.test` (비밀번호 `farmfi123`)

## 디렉토리 구조
- `frontend/` — 웹앱 (UI + API Routes + Prisma)
- `docs/` — 문서 (먼저 `docs/README.md`)

## 작업 규칙
- **브랜치**: 기능별 브랜치 후 PR (소규모는 `main` 직접도 가능)
- **커밋**: 하나의 완결된 단위마다 한 번. `feat:`/`fix:`/`docs:`/`chore:` 접두. 무관한 변경·시크릿·생성물 섞지 않기.
- **문서**: `docs/README.md` 규칙 준수.
- 에이전트(Claude Code) 작업 규칙은 루트 `CLAUDE.md`에 있음.

## 문서
| 파일 | 내용 |
|---|---|
| [docs/pivot-plan.md](docs/pivot-plan.md) | 피벗(STO→운영 인프라) 실행계획 |
| [docs/api-spec.md](docs/api-spec.md) | API 명세 |
| [docs/dev-log.md](docs/dev-log.md) | 진행상황·결정 기록 |
