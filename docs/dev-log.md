# 개발 로그 (Dev Log)

> "현재 상태·최근 결정·다음 할 일"을 담는 살아있는 인수인계 문서. **최신을 맨 위에** 쓰고, 끝난 항목은 자유롭게 압축·정리한다 (전체 이력은 git).
> 날짜 형식: `## YYYY-MM-DD — 작성자`

---

## 2026-06-19 — 박태정

### 사업계획서 기준 정합 (plan + 코드 + 문서)
대조 결과 `코드 == plan.md`인데 둘 다 사업계획서와 달라, **사업계획서를 기준으로 전부 정합**:
- **정산 워터폴** (`0153a7b`): OPEX 100만(전기60+재료40), 건물주 **월 고정 임대료 50만**(매출 무관), 플랫폼 수수료 **1.5%**(표13), **설비파트너 DRB 정산 제거**(설비공급·자문 협력사로만), 운영자 기본급 제거. 출력 키 `{opex, landlordRent, platformFee, investorDividend, operatorResidual, breakdown}`.
- **시드 단위경제** (`ecf3543`): CAPEX=모집목표 **1,750만**, 토큰가 **1만원**/총 **1,750**, 면적 25평(83㎡), 마일스톤 612.5/525/350/262.5만, M1 자산가치 1,050만, 작물 **새싹삼**, 데모 청약 500/250/1000·매출 297만.
- **검증 신호 표3** (`47231ee`): M2 `[iot]`, M3 `[photo,receipt]`, M4 `[iot,receipt]` + mock 매핑(M2 무이미지, receipt-2=판매 영수증).
- **문서** (`ca33655`·`72659cb`): api-spec 갱신; 중복·낡은 `dev-report.md` 삭제(참조 4곳 정리).

### DB 온라인화 (Supabase) — 실제로 붙고 시드됨
- 6/11 `tenant/user not found`의 원인 = **무료 플랜 자동 일시정지**(IPv4/IPv6 아님 — 이미 IPv4 pooler). 대시보드 Restore로 복구.
- **마이그레이션 gotcha**: 트랜잭션 pooler(6543)는 `prisma db push/pull`이 멈춤 → **세션 pooler(같은 호스트 5432, pgbouncer 제거)** 로 push. 런타임/시드 INSERT는 6543 정상.
- 시드 완료 + 정합값 DB 반영 확인. **API 스모크 통과**(`/api/projects`·`/api/dashboard` 200). 시드 .env 미로딩 버그 수정(`57a05d1`, dotenv import).
- **RLS**: Security Advisor 경고 → 14개 테이블 `enable row level security`. Prisma는 소유자라 통과. ⚠️ 새 테이블 `db push` 시 재적용 필요.
- 관찰: 시드 직후 라이브 NAV=0/-100%(청약·완료 0건) → 데모 돌리면 해소.

### 다음 할 일
- **[님] AI 키**(`OPENAI/ANTHROPIC_API_KEY`) 입력 + mock 이미지 5장(`public/demo/`) → **[나] verify 실테스트**
- **[님] 지갑 `PRIVATE_KEY` + faucet POL** → **[나] Amoy 배포 + `onchain.ts` 연결** (현재 txHash 전부 null)
- **[프론트/우민성]** 페이지 전체 미착수(랜딩 외). **[배포]** Vercel 환경변수·시연 전 Supabase Active 확인.
- 잔여 메모: `schema.prisma` ProjectPartner.role 주석 `equipment_partner` 잔존(모델 유지, 시드 미사용). `next build`는 Windows 한글경로 EISDIR → Vercel(Linux)로만 검증. `NEXT_PUBLIC_BASE_URL` 미설정 시 verify self-fetch 실패.

---

## 2026-06-11 — 박태정 · 버그 일괄 수정

- **컨트랙트** (`forge test` 17/17): Escrow refund에 projectFailed 게이트·회계 차감·첫 해제 후 청약 차단; Deploy.s.sol 배포자 PRIVATE_KEY 유도(DEFAULT_SENDER 오배정 방지).
- **P0(데모 차단)**: complete의 `userId:"system"` FK 위반 → userId optional; verify의 iot `data.passed` 오참조(M3 항상 실패) 수정; demo/step 실제 base64 로드 + 강제 verified 제거(**mock+키 전까진 스텝4~8 실패가 정상**); demo/reset IoT·NAV 재시드(`iot-seed.ts`); detect-anomaly 가동률 기간 기준·0건 통과 차단.
- **P1(검증 고도화)**: verify-contract 주소·면적(±20%) 대조; verify-receipt conditionText 부합; crossCheck(영수증↔사진) + 실패 Notification; ai-cache 전용 AiCache 모델로 분리.

---

## 2026-06-07 — 박태정 · 초기 셋업·문서체계

- **Prisma 7** driver adapter(`@prisma/adapter-pg`)로 정착 — 스키마 url 제거 + `prisma.config.ts`, `new PrismaClient()` 무인자 ❌. tsc 0 에러.
- `api-spec.md` 작성(API 15개), 문서체계 수립(레퍼런스=제자리 갱신 / 기록=이 로그 append), `.env` gitignore.
- 결정: **도커 미사용**(Vercel+Supabase) 확정.
- 초기 버그수정: verify `imageBase64` 키, detect-anomaly 모델·필드명, demo/step milestoneType enum, Prisma import 경로.
