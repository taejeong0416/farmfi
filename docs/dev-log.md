# 개발 로그 (Dev Log)

> "현재 상태·최근 결정·다음 할 일"을 담는 살아있는 인수인계 문서. **최신을 맨 위에** 쓰고, 끝난 항목은 자유롭게 압축·정리한다 (전체 이력은 git).
> 날짜 형식: `## YYYY-MM-DD — 작성자`

---

## 2026-06-26 — 박태정

### 온체인 Amoy 배포 완료 — txHash 실증명 (트랙 B 완수)
faucet POL 0.3 확보 후 실배포·온체인 e2e 재검증까지 끝. **`txHash`가 더 이상 `null`이 아니라 amoy.polygonscan에 실제로 뜬다.**
- **배포** (`forge script Deploy.s.sol --broadcast`, 가스 ~0.235 POL): FarmToken `0xc1aB764bE7C8F36980e94016bc52ED486Dbba53b` / Escrow `0xA855f6398fb71AD197Ec055853007007D3F7d452` / Dividend `0x6f0b29d66E8ED80721041C442c6f3e42a0a3dE7f`. 서버지갑(=배포자=operator=VERIFIER) `0x535FD6…caF9`. MINTER→Escrow, VERIFIER→배포자 권한 부여까지 스크립트가 처리.
- **주소 기록**: `frontend/.env`에 `ESCROW_ADDRESS`/`FARM_TOKEN_ADDRESS`/`DIVIDEND_ADDRESS` 추가 → `onchain.ts`의 `isOnchainEnabled()`가 true로 전환.
- **부트스트랩 청약 1회**: 서버지갑이 `subscribe()` 0.01 POL(=10토큰) 청약 → Escrow에 자금 락(totalLocked/remaining 0.01, currentMilestone 1). 사업수치(1,750구좌)는 DB 데모가 유지, 온체인은 증명 앵커.
- **온체인 e2e 재검증**: `onchain.ts`의 `verifyMilestoneOnChain`/`releaseTrancheOnChain`를 M1~M4로 실호출 → 8건 전부 txHash 반환. 최종 currentMilestone=5, totalReleased=0.01(전액), remaining=0. release가 operator(서버지갑)로 청약금 회수 → **순비용 가스뿐**(잔고 0.065 POL).
- 메모: 검증은 onchain 함수 직접 호출 격리 스크립트(`_onchain-test.ts`, 검증 후 삭제)로 수행 — AI 검증 로직은 06-21 e2e에서 이미 통과 확인됨이라 viem 호출 경로만 격리 증명. release는 **배포당 1회성**(재실행 시 `Already released` revert) — 반복 시연은 재배포 또는 `DEMO_MODE=cached` 재생.

### 다음 할 일
- **(🤖) 프론트 페이지** — 대시보드/프로젝트상세/청약 UI. 백엔드 API는 e2e 검증 완료라 붙이기만 하면 됨. (랜딩 `page.tsx` 외 전부 미착수)
- 배포: Vercel 환경변수(`GEMINI_API_KEY`·`ESCROW_ADDRESS` 등) 등록·시연 전 Supabase Active 확인. `next build`는 Windows 한글경로 EISDIR → Vercel(Linux)로만 검증.
- 재시연 운영: 라이브 온체인은 배포당 1회성이므로 반복 데모 시 재배포(POL 재확보) 또는 `DEMO_MODE=cached` 경로 필요.

---

## 2026-06-21 — 박태정

### 데모 8단계 e2e 실제 실행 — 검증 차단 버그 2건 잡고 전체 통과
dev 서버 띄우고 `/api/demo/reset` → `step 1~8` 실제 실행(Gemini 실호출). 그동안 AI 추출만 단독 검증했는데, e2e로 처음 끝까지 돌려 **2건의 신호 정합 버그** 발견·수정:
- **사진 객체 정규화** (`verify-photo`): Gemini가 객체를 `{label, box_2d}` 배열로 반환 → 코드가 `string[]` 가정으로 `join()`해 `"[object Object]"`가 됨. **마일스톤1 crossCheck(영수증↔사진)가 항상 실패**. label 문자열로 정규화해 해결.
- **영수증 신호 분리** (`verify-receipt`): 마일스톤4 `conditionText`가 "IoT 60일 + 복수 판매 영수증"을 묶어 전달 → 영수증 검증기가 IoT 가동률까지 떠안아 `matchesCondition=false`. 프롬프트에 "영수증으로 확인 불가한 IoT·센서·사진 요건은 별도 신호로 검증되니 판단 제외" 명시. 영수증은 자기 조건(복수 판매)만 평가.
- **결과**: 8단계 전부 통과 — 청약 1,750구좌 완판, 트랜치 17,500,000 **전액 해제**(remaining 0), 마일스톤 1~4 completed, 배당 분배, status `operating`. 정산 워터폴도 정합(투자자배당 1,013,565 / perToken 579).
- 메모: AiCache는 `milestoneId`별 키라 reset(새 마일스톤 id)하면 자동 무효화. 단일 스텝 재검증 시엔 해당 캐시 행 삭제 필요.

### 온체인 트랜치 집행 연동 (배포 전 코드 준비 완료)
검증명제 ②③을 온체인에서 집행하도록 연동. **POL 없이 가능한 코드까지 완료, 실배포만 남음.**
- **`onchain.ts` 신규**: viem로 서버 지갑(=배포자=VERIFIER)이 `Escrow.verifyMilestone`(②)·`releaseTranche`(③) 호출. `isOnchainEnabled()` — `ESCROW_ADDRESS`/`PRIVATE_KEY` 미설정 시 비활성→`null` 반환(배포 전 안전).
- **라우트 연동**: `verify`는 AI 통과 시에만 `verifyMilestoneOnChain` 호출(강제통과 금지 유지), `complete`는 해제 시 `releaseTrancheOnChain` 호출 → 지금까지 `null`이던 txHash 채움. 체인 오류는 try/catch 격리 → DB 데모 무중단.
- **점검 통과**: tsc 0 에러, `forge build` 성공. 흐름 정합 확인 — 데모 마일스톤 seq 1→4 순서가 컨트랙트 `seq==currentMilestone`과 일치, operator=배포자라 release POL이 서버 지갑으로 회수(순비용 가스뿐).
- **방식 = 증명 앵커링**: DB 데모는 사업수치(1,750구좌) 유지, 온체인엔 서버 지갑 소액 청약 1회로 부트스트랩 후 verify/release를 실제 호출해 txHash 증명. (완전 온체인 청약은 faucet POL 한도 초과라 제외)
- **⚠️ 시연 운영 노트**:
  - 온체인 release는 **배포당 1회성**(재실행 시 `Already released` revert→txHash null). 반복 시연은 ①배포 직후 라이브 1회 실행→txHash가 `DemoCache`에 캐시되면 `DEMO_MODE=cached`로 재생, 또는 ②재배포.
  - 배당(step 7)은 오프체인 유지(명제 ①②③은 트랜치로 충족, 범위 밖).
  - 라이브 1회 실행 시 온체인 txn ~8개 → 약 20~40초 추가 지연.

_(온체인 배포·프론트 등 다음 할 일은 06-26 섹션으로 이동)_

---

## 2026-06-20 — 박태정

### AI 검증 무료화 — Gemini provider + mock 이미지 (verify 실테스트 통과)
- **provider 추상화** (`src/lib/ai-vision.ts` 신규): `extractFromImage()` 공용 헬퍼 — 키가 설정된 provider만 **Gemini → OpenAI → Anthropic** 순서로 폴백. verify-receipt/contract/photo 라우트의 중복 callOpenAI/callAnthropic 제거 → 헬퍼 호출로 교체(검증 로직 불변).
- **무료 Gemini** (`@google/genai`, 모델 `gemini-3.5-flash`): 현재 `GEMINI_API_KEY`만 설정 → 무료로 동작. 유료 전환은 `OPENAI/ANTHROPIC_API_KEY`만 채우면 라우트 수정 없이 폴백 체인에 자동 합류.
- **mock 이미지 5장** (`public/demo/`): ChatGPT 콜라주 1장을 sharp로 5분할(mock-contract / mock-receipt-1·2 / mock-photo-1·3). 원본 콜라주는 삭제.
- **verify 실테스트 통과**(Gemini 단독): 계약서 금정구·83㎡ 정상 추출(프로젝트 정합), 구매영수증 LED/센서/재배대/관수 키워드 확보(교차검증용), 사진 설비·작물 confidence 0.95+. → **무료 모델로 데모 검증 충분.** (※ e2e crossCheck/조건 정합 버그는 06-21에 수정)
- 잔여 메모: `NEXT_PUBLIC_BASE_URL` 미설정 시 verify self-fetch는 localhost:3000 기본값 사용. `schema.prisma` ProjectPartner.role 주석 `equipment_partner` 잔존(모델 유지, 시드 미사용).

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
- 관찰: 시드 직후 라이브 NAV=0/-100%(청약·완료 0건) → 데모 돌리면 해소.

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
