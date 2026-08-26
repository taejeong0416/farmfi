# Contributing

FarmFi 개발 가이드. 기능 범위와 화면 흐름은 [docs/spec/feature-spec.md](docs/spec/feature-spec.md)(웹)·[docs/spec/app-feature-spec.md](docs/spec/app-feature-spec.md)(앱)를 먼저 읽으면 빠르다.

## 기술 스택
- **웹/백엔드**: Next.js 14 (App Router + API Routes), TypeScript
- **모바일 앱**: Expo React Native (SDK 57) — 운영자용
- **DB**: PostgreSQL (Supabase) + Prisma ORM (Prisma 7, driver adapter)
- **온체인**: Foundry (Solidity) · Polygon Amoy · 서버 실행은 viem
- **인증**: 이메일 + 비밀번호 (bcryptjs), jose 세션(JWT) — 웹은 쿠키, 앱은 Bearer
- **신원인증(KYC)**: OmniOne OpenDID Verifier (자체 호스팅) — 로그인과 별개
- **AI 검증**: Google Gemini 비전·OCR (provider 폴백: Gemini → OpenAI → Anthropic)
- **이상 탐지**: Z-score + 도메인 정상범위 판정 (자체 구현)
- **배포**: Vercel(웹·API) · Supabase(DB) · EAS(앱). 도커 미사용

## 개발 환경 셋업

1. 클론 후 `cd frontend && npm install`
2. `cp .env.example .env` 후 키 설정 — 전체 목록과 설명은 `.env.example` 참고

   | 키 | 필수 | 용도 |
   |---|:---:|---|
   | `DATABASE_URL` | ✅ | Supabase PostgreSQL 연결 문자열 (트랜잭션 pooler 6543) |
   | `JWT_SECRET` | ✅ | 세션(JWT) 서명 키 |
   | `GEMINI_API_KEY` | ✅ | 마일스톤 증빙 AI 검증 |
   | `ESCROW_ADDRESS` · `PRIVATE_KEY` | | 온체인 기록. 없으면 온체인 호출이 `null` 반환 |
   | `ONCHAIN_*` | | 체인 전환(RPC·chainId·gas0). 없으면 Amoy 폴백 |
   | `IDENTITY_*` | | OpenDID 신원인증. `stub`이면 3초 자동인증 목업 |
   | `DEMO_MODE` | | `live`(실호출) / `cached`(성공 결과 재생) |
   | `BANK_WEBHOOK_SECRET` | | 은행 입금 웹훅 서명 검증 키. 없으면 검증을 건너뛴다 |
   | `DEPOSIT_DEADLINE_HOURS` | | 가상계좌 입금기한 (기본 24) |
   | `MOCK_BANK_SCENARIO` | | `normal` / `issue_failed` / `mismatch` / `delayed` — I-03E 분기 재현 |
   | `MOCK_BANK_DEPOSIT_DELAY_SEC` | | Mock 은행이 입금하기까지 걸리는 시간 (기본 0) |
   | `CRON_SECRET` | | 대사 크론(`/api/cron/reconcile`) 호출 키. 없으면 크론 경로가 503으로 닫힌다 |

3. `npm run prisma:generate` → `npm run prisma:push` → `npm run seed`
   - `prisma db push`(DDL)는 **세션 pooler(5432)** 필요 — 일반 URL이 6543(트랜잭션 pooler)이면 `--url`로 5432 오버라이드. 시드(DML)는 6543으로 OK.
4. `npm run dev` → http://localhost:3000
   - 시드 로그인 계정: `operator@farmfi.test` / `admin@farmfi.test` (비밀번호 `farmfi123`)

**운영자 앱**: `cd app && npm install && npx expo start`

**컨트랙트**: `cd contracts && git submodule update --init && forge test`

## 검증 방법

로컬 `npm run build`는 경로 한글(`D:\해커톤`) + Node 22/Next 14.2의 `readlink` EISDIR로 실패한다. 클린 상태에서도 재현되는 환경 문제이며 코드 문제가 아니다. 프로덕션 빌드는 Vercel(Linux)에서 돈다.

로컬 검증은 `npx tsc --noEmit` + `npm run dev` + curl 조합으로 한다. 이 조합이 못 잡는 것이 있다는 점은 알고 있어야 한다 — `tsconfig` target이 es2017이라 BigInt 리터럴(`0n`)은 로컬 tsc를 통과하고 Vercel 빌드에서 깨진다. `BigInt(0)` 생성자를 쓴다.

## 디렉토리 구조
- `frontend/` — 웹앱 (UI + API Routes + Prisma)
- `app/` — Expo React Native 운영자 앱
- `contracts/` — Foundry 스마트컨트랙트
- `docs/` — 문서 (먼저 `docs/README.md`)

## 작업 규칙
- **브랜치**: 기능별 브랜치 후 PR (소규모는 `main` 직접도 가능)
- **커밋**: 하나의 완결된 단위마다 한 번. `feat:`/`fix:`/`docs:`/`chore:` 접두. 무관한 변경·시크릿·생성물 섞지 않기.
- **문서**: `docs/README.md` 규칙 준수.
- 에이전트(Claude Code) 작업 규칙은 루트 `CLAUDE.md`에 있음.

## 문서
| 파일 | 내용 |
|---|---|
| [docs/spec/feature-spec.md](docs/spec/feature-spec.md) | 웹 기능명세서 |
| [docs/spec/app-feature-spec.md](docs/spec/app-feature-spec.md) | 운영자 앱 기능명세서 |
| [docs/dev-log.md](docs/dev-log.md) | 진행상황·결정 기록 |
