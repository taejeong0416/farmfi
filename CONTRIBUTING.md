# Contributing

FarmFi 개발 가이드.

## 기술 스택
- **프론트/백엔드**: Next.js 14 (App Router + API Routes), TypeScript
- **DB**: PostgreSQL (Supabase) + Prisma ORM
- **블록체인**: Foundry (Solidity), Polygon Amoy 테스트넷, wagmi / viem
- **AI 검증**: OpenAI GPT-4o + Anthropic Claude (이중화)
- **배포**: Vercel (도커 미사용)

## 개발 환경 셋업
1. 클론 후 `cd frontend && npm install`
2. `frontend/.env` 생성 — 아래 키 설정:

   | 키 | 용도 |
   |---|---|
   | `DATABASE_URL` | Supabase PostgreSQL 연결 문자열 |
   | `OPENAI_API_KEY` | GPT-4o 검증 |
   | `ANTHROPIC_API_KEY` | Claude 검증 (fallback) |
   | `NEXT_PUBLIC_BASE_URL` | 내부 API 호출용 (로컬: `http://localhost:3000`) |
   | `DEMO_MODE` | `live` 또는 `cached` |
   | `FARM_TOKEN_ADDRESS`, `ESCROW_ADDRESS` | 배포된 컨트랙트 주소 (배포 후) |

3. `npm run prisma:generate` → `npm run prisma:push` → `npm run seed`
4. `npm run dev` → http://localhost:3000

컨트랙트: `cd contracts && forge build && forge test`
(배포는 플랜 `docs/plan.md` L2-2-5 참고 — `PRIVATE_KEY`, `AMOY_RPC_URL` 필요)

## 디렉토리 구조
- `frontend/` — 웹앱 (UI + API Routes + Prisma)
- `contracts/` — 스마트컨트랙트 (Foundry)
- `docs/` — 문서 (먼저 `docs/README.md`)

## 작업 규칙
- **브랜치**: 소규모라 `main` 직접 커밋 (또는 기능별 브랜치 후 PR)
- **커밋**: 하나의 완결된 단위마다 한 번. `feat:`/`fix:`/`docs:`/`chore:` 접두. 무관한 변경·시크릿·생성물 섞지 않기.
- **문서**: `docs/README.md` 규칙 준수.
- 에이전트(Claude Code) 작업 규칙은 루트 `CLAUDE.md`에 있음.

## 문서
| 파일 | 내용 |
|---|---|
| [docs/plan.md](docs/plan.md) | 구현 플랜 |
| [docs/api-spec.md](docs/api-spec.md) | API 명세 |
| [docs/dev-report.md](docs/dev-report.md) | 개발 현황 보고서 |
| [docs/dev-log.md](docs/dev-log.md) | 진행상황·결정 기록 |
