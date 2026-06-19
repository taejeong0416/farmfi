# FarmFi — 3계층 구현 플랜

> 메커니즘 레이어(스마트컨트랙트 + AI 검증)는 Polygon Amoy 테스트넷에 실제 배포.
> 결제 입출구 레이어(원화 입출금·KYC·공시)는 모의 처리.

---

## L1-1. 프로젝트 기반 셋업

> Next.js + Foundry 프로젝트 생성부터 DB 연결, 시드 데이터, 공통 유틸까지.

### L2-1-1. Next.js 프로젝트 초기화

#### L3 태스크
- [ ] `npx create-next-app@14 frontend --typescript --tailwind --app --src-dir`
- [ ] 기본 보일러플레이트 정리 (page.tsx 내용 비우기, globals.css 초기화)
- [ ] path alias 확인 (`@/` → `src/`)
- [ ] shadcn/ui 초기화: `npx shadcn-ui@latest init`
- [ ] shadcn 컴포넌트 추가: `button, card, badge, progress, table, tabs, dialog, input, separator, toast, select, slider`
- [ ] 추가 패키지 설치: `npm i recharts framer-motion lucide-react`
- [ ] Web3 패키지 설치: `npm i wagmi viem @rainbow-me/rainbowkit @tanstack/react-query`
- [ ] `.gitignore` 확인 (`.env.local`, `node_modules`, `.next`)

### L2-1-2. Foundry 프로젝트 초기화

#### L3 태스크
- [ ] `cd contracts && forge init --no-commit`
- [ ] OpenZeppelin 설치: `forge install OpenZeppelin/openzeppelin-contracts --no-commit`
- [ ] `foundry.toml` 설정 (solc 0.8.24, remappings)
- [ ] `remappings.txt`: `@openzeppelin/=lib/openzeppelin-contracts/`
- [ ] 기본 빌드 확인: `forge build`

### L2-1-3. DB + ORM 연결

#### L3 태스크
- [ ] Prisma 설치: `npm i prisma @prisma/client` → `npx prisma init`
- [ ] Supabase 무료 프로젝트 생성 → Connection String 복사
- [ ] `.env.local`에 `DATABASE_URL` 설정
- [ ] `prisma/schema.prisma` 작성 — 모델:
  - `User` (id, name, role, email, walletAddress, balance)
  - `Project` (id, name, description, location, buildingType, areaSqm, tokenSymbol, tokenPrice, totalTokens, soldTokens, targetAmount, currentAmount, status, fundingStart, fundingEnd, imageUrl, contractAddress)
  - `Escrow` (id, projectId, totalLocked, totalReleased, remaining, status, contractAddress)
  - `Milestone` (id, projectId, seq, name, description, releasePct, releaseAmount, status, conditionText, requiredSignals, iotMinDays, retryCount, crossCheck, evidenceUrl, aiVerificationResult, completedAt)
  - `Transaction` (id, projectId, userId, type, amount, tokenAmount, txHash, blockNumber, memo)
  - `TokenHolding` (id, userId, projectId, amount, avgPrice) — unique(userId, projectId)
  - `Dividend` (id, projectId, totalRevenue, totalDividend, perToken, period)
  - `DividendClaim` (id, dividendId, userId, tokenAmount, claimAmount, claimed, claimedAt)
  - `IotData` (id, projectId, temperature, humidity, co2Level, lightIntensity, phLevel, growthRate, anomalyScore, isAnomaly, recordedAt)
  - `Notification` (id, milestoneId, type, message, evidenceUrl, isRead, createdAt)
  - `ProjectPartner` (id, projectId, role, name, totalContribution, recoveredAmount, monthlyRecoveryAmount, recoveryComplete)
  - `NavSnapshot` (id, projectId, nav, escrowBalance, assetValue, cumulativeCashFlow, recordedAt)
  - `DemoCache` (id, step, signalType, txHash, blockNumber, result, createdAt)
- [ ] `npx prisma db push`로 스키마 반영
- [ ] `src/lib/db.ts` — PrismaClient 싱글턴

### L2-1-4. Web3 설정

#### L3 태스크
- [ ] `src/lib/wagmi-config.ts`
  - Polygon Amoy 체인 설정 (chainId: 80002)
  - RainbowKit 프로바이더 설정
  - public RPC: `https://rpc-amoy.polygon.technology`
- [ ] `src/app/providers.tsx` — WagmiProvider + QueryClientProvider + RainbowKitProvider 래핑
- [ ] `src/app/layout.tsx`에 Providers 적용
- [ ] `src/lib/contracts.ts` — 배포된 컨트랙트 주소 + ABI export
  - `FARM_TOKEN_ADDRESS`, `ESCROW_ADDRESS`, `DIVIDEND_ADDRESS`, `VESTING_ADDRESS`
  - 각 컨트랙트 ABI (forge build 결과에서 추출)

### L2-1-5. 시드 데이터

#### L3 태스크
- [ ] `prisma/seed.ts` 작성:
  - 사용자 5명 시딩
    - 투자자: 김민수(잔액 500만), 이서연(300만), 박준혁(1000만)
    - 건물주: 최영호
    - 운영자: 정하은
    - 각 사용자에 테스트넷 지갑 주소 부여
  - 프로젝트 1개 시딩
    - "금정구 미니팜 1호", 심볼 MF01, 토큰가격 10,000원(1구좌), 총 토큰 1,750개, 목표 1,750만원, totalCapex: 1,750만원, 면적 25평(≈83㎡), 작물 새싹삼 (사업계획서 표7 단위경제)
    - status: 'funding', contractAddress: 배포된 FarmToken 주소
  - 에스크로 1개 시딩 (contractAddress: 배포된 Escrow 주소)
  - 마일스톤 4개 시딩 (집행액 = 1,750만원 × 비율)
    - seq 1: "공간 준비", 35%, 612.5만원, requiredSignals: [contract, receipt, photo], iotMinDays: 0, crossCheck: receipt↔photo, assetValue: 1,050만원 (설비 잔존가치 60%)
    - seq 2: "시운전 + 안정성", 30%, 525만원, requiredSignals: [iot], iotMinDays: 14, assetValue: 0 (센서 정상 가동 검증, 표3)
    - seq 3: "첫 수확 + 판매", 20%, 350만원, requiredSignals: [photo, receipt], iotMinDays: 0, assetValue: 0 (수확 사진 + 판매 영수증, 표3)
    - seq 4: "지속 운영", 15%, 262.5만원, requiredSignals: [iot, receipt], iotMinDays: 60, assetValue: 0 (센서 60일 + 복수 판매 영수증, 표3)
- [ ] `npx prisma db seed` 실행

### L2-1-6. 공통 유틸리티

#### L3 태스크
- [ ] `src/lib/nav-calculator.ts` — 토큰 NAV(순자산가치) 실시간 계산
  - `calculateNAV(projectId)` → 호출 시마다 재계산
  - NAV = (에스크로 잔액 + 확인된 자산가치 + 누적 순현금흐름) / 총 토큰 수
  - 입력 데이터:
    - 에스크로 잔액: 온체인에서 읽기 (실시간)
    - 확인된 자산가치: 마일스톤 통과 시 확정 (시드에 마일스톤별 assetValue 설정)
    - 누적 순현금흐름: 배당 기록 + IoT 가동률 기반 예상 매출 추정
  - 출력: `{ nav: number, breakdown: { escrow, asset, cashFlow }, previousNav, changeRate }`
  - 마일스톤 통과 → 자산가치 확정 → 큰 점프
  - IoT 데이터 축적·시간 경과 → 점진적 상승
  - 산식 메모: cashFlow에 누적 배당(이미 투자자에게 지급된 금액)을 합산한다 — 엄밀한 순자산이 아니라 "프로젝트가 만들어낸 가치"를 보여주는 데모 산식. 심사 질의 대비 설명 준비.
- [ ] `src/lib/format.ts`
  - `formatKRW(amount)` → "5,000,000원"
  - `formatPercent(value)` → "72.5%"
  - `formatDate(date)` → "2026.05.09 14:23"
  - `timeAgo(date)` → "2분 전"
  - `shortenHash(hash)` → `0xa3f2...8b1c`
- [ ] `src/lib/constants.ts`
  - `ProjectStatus` enum: upcoming, funding, funded, operating, completed
  - `TransactionType` enum: subscription, tranche_release, dividend, revenue
  - `MilestoneStatus` enum: pending, in_progress, verified, completed, failed, manual_review

### L2-1-7. 레이아웃 껍데기

#### L3 태스크
- [ ] `src/app/layout.tsx` — 루트 레이아웃 (Pretendard 폰트, 메타데이터, Providers + GNB + children + Footer)
- [ ] `src/components/layout/gnb.tsx`
  - 로고: "FarmFi"
  - 메뉴: 프로젝트 탐색(/projects), 대시보드, 데모(/demo)
  - 우측: 지갑 연결 버튼 (RainbowKit ConnectButton) + 관리자(/admin)
- [ ] `src/components/layout/footer.tsx` — "FarmFi | PNU 창의융합AI해커톤 2026" 한 줄

---

## L1-2. 스마트컨트랙트 (Foundry)

> 핵심 차별점. 마일스톤 미달 시 자금이 풀리지 않음을 코드로 보장한다.

### L2-2-1. FarmToken 컨트랙트

#### L3 태스크
- [ ] `contracts/src/FarmToken.sol`
  - ERC-20 기반, OpenZeppelin `ERC20`, `AccessControl` 상속
  - `MINTER_ROLE` — 에스크로 컨트랙트만 민팅 가능
  - `constructor(name, symbol, totalSupply)` — 총 발행량 설정
  - `mint(to, amount)` — MINTER_ROLE만 호출 가능
  - `decimals()` → 0 (토큰 1개 = 지분 1단위)
  - 이벤트: `TokenMinted(to, amount)`
- [ ] `contracts/test/FarmToken.t.sol`
  - 민팅 권한 테스트: MINTER_ROLE 없는 주소가 mint 호출 시 revert
  - 총 발행량 초과 민팅 시 revert
  - 정상 민팅 + 잔액 확인

### L2-2-2. Escrow 컨트랙트

#### L3 태스크
- [ ] `contracts/src/Escrow.sol`
  - OpenZeppelin `ReentrancyGuard`, `AccessControl` 상속
  - 상태 변수:
    - `farmToken` (FarmToken 주소)
    - `totalLocked`, `totalReleased`, `remaining`
    - `milestones` mapping (seq → Milestone struct)
    - `milestoneCount`, `currentMilestone`
  - Milestone struct: `{name, releasePct, releaseAmount, status, verified}`
  - `VERIFIER_ROLE` — AI 검증 결과를 기록할 수 있는 역할
  - `subscribe(amount)` payable
    - msg.value를 에스크로에 락업
    - FarmToken 민팅 (투자자에게)
    - 이벤트: `Subscribed(investor, amount, tokenAmount)`
  - `verifyMilestone(seq, passed)` — VERIFIER_ROLE만 호출
    - milestone.verified = passed
    - passed == false면 상태 변경 없이 이벤트만 발생
    - 이벤트: `MilestoneVerified(seq, passed)`
  - `releaseTranche(seq)` — 누구나 호출 가능하지만 조건 충족해야 실행
    - require: milestone.verified == true
    - require: seq == currentMilestone (순서 강제)
    - require: milestone.status != Released
    - releaseAmount만큼 운영자 주소로 전송
    - totalReleased += releaseAmount, remaining -= releaseAmount
    - currentMilestone++
    - 이벤트: `TrancheReleased(seq, amount, operator)`
  - `markFailed()` — 관리자(DEFAULT_ADMIN_ROLE)만 호출, 프로젝트 실패 선언
    - 실패 후 subscribe / releaseTranche 차단 (남은 자금은 환불 전용)
  - `refund()` — **projectFailed 상태에서만** 남은 자금 투자자 비례 환불
    - 환불 시 totalLocked / remaining 차감 (회계 정합 유지)
    - 알려진 한계: 환불 후 토큰 미소각 (실서비스 전환 시 소각/블랙리스트 필요 → L1-11)
  - subscribe는 첫 트랜치 해제 이후 차단 (`currentMilestone == 1` 요구) — 해제 후 청약 시 releaseAmount 재계산이 꼬이는 것 방지
- [ ] `contracts/test/Escrow.t.sol`
  - **검증 명제 ①**: 마일스톤 미검증 상태에서 releaseTranche 호출 → revert
  - **검증 명제 ②**: VERIFIER_ROLE 없는 주소가 verifyMilestone 호출 → revert
  - **검증 명제 ②**: 운영자가 직접 releaseTranche 호출 → verified 아니면 revert
  - **검증 명제 ③**: 검증 통과 후 releaseTranche → 정상 실행, 운영자에게 자금 전송 확인
  - 순서 스킵 시도 (seq 2를 seq 1 전에 해제) → revert
  - 전체 시나리오: subscribe → verify(1) → release(1) → verify(2) → release(2) → verify(3) → release(3) → verify(4) → release(4) → remaining == 0

### L2-2-3. Dividend 컨트랙트

#### L3 태스크
- [ ] `contracts/src/Dividend.sol`
  - `farmToken` 참조
  - `distributeDividend()` payable
    - msg.value를 배당 풀에 추가
    - `perToken = msg.value / totalSupply`
    - 배당 라운드 기록
    - 이벤트: `DividendDistributed(round, totalAmount, perToken)`
  - `claimDividend(round)`
    - 토큰 보유량 * perToken 계산
    - 이미 클레임한 라운드 중복 방지
    - 투자자에게 전송
    - 이벤트: `DividendClaimed(investor, round, amount)`
- [ ] `contracts/test/Dividend.t.sol`
  - 배당 분배 + 보유 비율에 따른 정확한 금액 클레임 테스트
  - 중복 클레임 시 revert
  - 토큰 0개 보유자 클레임 시 revert
- 알려진 한계 (데모 범위에서 수용, 실서비스 시 L1-11에서 처리):
  - claim이 분배 시점이 아닌 **현재 잔고** 기준 → 토큰을 다른 지갑으로 옮기면 같은 라운드 중복 수령 가능. 실서비스에서는 스냅샷(체크포인트) 방식 필요.

### L2-2-4. Vesting 컨트랙트

> **변경:** 우선순위 낮춤. 데모 시연에서 Vesting은 직접 사용되지 않으므로 핵심 3개 컨트랙트(FarmToken, Escrow, Dividend) 완료 후 시간 여유 시 구현.

#### L3 태스크 (우선순위: 낮음)
- [ ] `contracts/src/Vesting.sol`
  - `farmToken` 참조
  - `operator` 주소, `totalAllocation`, `cliffDuration` (1년), `vestingDuration` (4년)
  - `startTime` — 베스팅 시작 시점
  - `released` — 이미 인출한 양
  - `vestedAmount()` view — 현재 시점 기준 베스팅된 총량 계산
    - cliff 이전: 0
    - cliff 이후: `totalAllocation * (elapsed - cliff) / vestingDuration` (선형)
    - 최대: totalAllocation
  - `release()` — operator만 호출, vestedAmount - released만큼 전송
  - `revoke()` — 관리자만 호출, 미베스팅분 회수
    - 이벤트: `VestingRevoked(operator, revokedAmount)`
- [ ] `contracts/test/Vesting.t.sol`
  - cliff 이전 release 시도 → 0 또는 revert
  - cliff 직후 release → 정상 인출
  - 4년 후 전량 인출 확인
  - revoke 후 미베스팅분 회수 확인

### L2-2-5. 배포 스크립트

#### L3 태스크
- [ ] `contracts/script/Deploy.s.sol`
  - FarmToken 배포 → Escrow 배포 (FarmToken 주소 전달) → Dividend 배포 (→ Vesting 배포는 시간 여유 시)
  - Escrow에 MINTER_ROLE 부여 (FarmToken에서)
  - 배포 주소 콘솔 출력
  - 주의: 배포자 주소는 `msg.sender`가 아니라 `vm.addr(vm.envUint("PRIVATE_KEY"))`로 유도 (--sender 미지정 시 Foundry DEFAULT_SENDER가 잡혀 역할이 엉뚱한 주소로 가는 것 방지 — 반영됨)
- [ ] `.env`에 `PRIVATE_KEY`, `AMOY_RPC_URL` 설정
- [ ] `forge script script/Deploy.s.sol --rpc-url $AMOY_RPC_URL --broadcast`
- [ ] 배포된 주소를 `frontend/src/lib/contracts.ts`에 반영
- [ ] ABI 파일 추출: `forge build` → `out/` 디렉토리에서 JSON 복사 → `frontend/src/lib/abi/`

---

## L1-3. AI 검증 레이어

> 마일스톤 검증을 사람이 아닌 AI가 수행. 다중 신호로 단독 판단 한계를 보완한다.

### L2-3-1. 영수증 OCR 검증

#### L3 태스크
- [ ] `src/app/api/ai/verify-receipt/route.ts` — POST
  - 요청: `{ milestoneId, imageBase64 }`
  - GPT-4o API 호출 (이중화: 실패 시 Claude Sonnet 4 Vision API)
  - 프롬프트: 영수증 이미지에서 금액·항목·일자 JSON 추출
  - 마일스톤의 conditionText와 대조 (금액 범위, 항목 일치 여부)
  - 응답: `{ passed: boolean, extractedData: {...}, confidence: number, reason: string }`
  - milestone.aiVerificationResult에 결과 저장

### L2-3-2. 임대차 계약서 OCR 검증

#### L3 태스크
- [ ] `src/app/api/ai/verify-contract/route.ts` — POST
  - 요청: `{ milestoneId, imageBase64 }`
  - GPT-4o Vision API (이중화: Claude Sonnet 4 Vision)
  - 프롬프트: 임대차 계약서 이미지에서 임대인·임차인·주소·면적·계약기간·월세 JSON 추출
  - 마일스톤 conditionText 및 프로젝트 location/areaSqm과 대조 (주소 일치, 면적 범위)
  - 응답: `{ passed: boolean, extractedData: { landlord, tenant, address, areaSqm, period, rent }, confidence: number, reason: string }`

### L2-3-3. 공사·수확 사진 분석

#### L3 태스크
- [ ] `src/app/api/ai/verify-photo/route.ts` — POST
  - 요청: `{ milestoneId, imageBase64, milestoneType: 'construction' | 'trial_run' | 'harvest' | 'operation' }`
  - GPT-4o Vision API (이중화: Claude Sonnet 4 Vision)
  - construction: LED·센서·재배대·관수 설비 객체 인식 → 신뢰도 점수
  - trial_run: 설비 가동 상태(LED 점등, 관수 작동, 작물 초기 생장) 확인
  - harvest: 작물 생장 상태, 수확물 존재 여부 판단
  - operation: 지속 운영 현황(작물 상태, 설비 유지, 재배 환경) 확인
  - 응답: `{ passed: boolean, detectedObjects: [...], confidence: number, reason: string }`

### L2-3-4. IoT 이상 탐지

> **변경:** Python(scikit-learn) 의존 제거. Vercel에서 Python 실행 불가하므로 **TypeScript로 Z-score 기반 이상 탐지 구현**. iot-mock/은 참고용 시뮬레이션 스크립트로만 유지.

#### L3 태스크
- [ ] `src/lib/anomaly-detector.ts`
  - Z-score 기반 이상 탐지 (TypeScript 구현)
  - 입력: 최근 N건 IoT 데이터 (온도, 습도, CO2, 광량, pH)
  - 각 센서값의 평균·표준편차 계산 → ±3σ 벗어나면 이상 플래그
  - 출력: 각 데이터포인트의 anomaly_score + is_anomaly 플래그
  - **가동률 계산**: 지정 기간(iotMinDays) 내 정상 데이터 비율 (≥ 90% 시 통과)
    - 가동률 = (정상 데이터 수 / 전체 데이터 수) × 100
    - 마일스톤 2: 14일간 가동률 ≥ 90%
    - 마일스톤 4: 60일간 가동률 ≥ 90%
- [ ] `src/app/api/ai/detect-anomaly/route.ts` — POST
  - 최근 IoT 데이터 조회 → `anomaly-detector.ts` 호출
  - iotMinDays > 0인 마일스톤 → 해당 기간 가동률 계산 포함
  - 이상 탐지 시 마일스톤 일시 정지 트리거
  - 응답: `{ anomalyDetected: boolean, anomalyScore: number, affectedSensors: [...], uptimeRate?: number }`
- [ ] `iot-mock/anomaly_detector.py` (참고용, 배포에 포함하지 않음)
  - scikit-learn Isolation Forest 로컬 실험용 스크립트

### L2-3-5. 통합 검증 → 온체인 기록

#### L3 태스크
- [ ] `src/app/api/milestones/[id]/verify/route.ts` — POST
  - 요청: `{ contractImage?, receiptImage?, photoImage?, milestoneType }`
  - 순서:
    1. DB에서 해당 마일스톤의 `requiredSignals`, `crossCheck` 조회
    2. requiredSignals에 포함된 신호만 검증 호출:
       - `contract` → 임대차 계약서 OCR API
       - `receipt` → 영수증 OCR API
       - `photo` → 사진 Vision API
       - `iot` → IoT 이상 탐지 API (iotMinDays > 0이면 가동률 ≥ 90% 추가 확인)
    3. crossCheck 설정 시 교차검증 수행 — 영수증 구매 항목 ↔ 사진 검출 객체가 같은 설비 카테고리(LED/센서/재배대/관수)를 하나 이상 공유하는지 키워드 매칭 (반영됨)
    4. **AND 조건**: 필수 신호 전부 통과 + 교차검증 통과 시 최종 passed
  - 최종 passed → 온체인 `escrow.verifyMilestone(seq, true)` 트랜잭션 전송 (서버 지갑)
  - 최종 failed:
    1. `milestone.retryCount++`
    2. retryCount == 1 (첫 실패) → **재검증 1회 허용**, Notification 레코드 직접 생성 (실패 사유 + 미통과 신호 — admin/notify API 경유 대신 직접 생성으로 변경, 반영됨)
    3. retryCount >= 2 (2회 실패) → `milestone.status = 'manual_review'`, 자동 차단, 관리자 수동 검토 대기 + Notification 생성
    4. 온체인 `escrow.verifyMilestone(seq, false)` + 거부 사유 기록
  - DB에 milestone.aiVerificationResult 업데이트
  - 응답: `{ passed, signals: { contract?, receipt?, photo?, iot? }, retryCount, txHash }`
- [ ] `src/app/api/admin/notify/route.ts` — POST
  - 요청: `{ milestoneId, failureReason, evidenceUrl, retryCount }`
  - 관리자 대시보드에 알림 레코드 생성 (DB Notification 테이블 또는 Milestone의 플래그)
  - 데모에서는 관리자 대시보드 배지로 표시

---

## L1-4. STO 핵심 플로우 (청약 → 에스크로 → 트랜치 → 배당)

> 투자자가 돈을 넣고 → 에스크로에 잠기고 → 마일스톤마다 풀리고 → 수익이 돌아오는 전체 사이클.

### L2-4-1. 프로젝트 목록 페이지

#### L3 태스크
- [ ] `src/app/api/projects/route.ts` — GET
  - DB에서 프로젝트 전체 조회 (escrow, milestones include)
  - 모집률 계산: `(currentAmount / targetAmount) * 100`
  - 투자자 수: TokenHolding count
- [ ] `src/app/projects/page.tsx`
  - 페이지 타이틀 "프로젝트 탐색"
  - 상태 필터 탭 (전체 / 청약중 / 운영중)
  - 카드 그리드 (반응형: lg 3열, md 2열, sm 1열)
- [ ] `src/components/project/project-card.tsx`
  - 상태 뱃지 (청약중: 파랑, 운영중: 초록, 완료: 회색)
  - 프로젝트 이름 + 위치
  - 모집률 프로그레스바 + 퍼센트
  - 토큰 가격 + 남은 토큰 수
  - "상세보기" 버튼 → `/projects/[id]`

### L2-4-2. 프로젝트 상세 + 청약

#### L3 태스크
- [ ] `src/app/api/projects/[id]/route.ts` — GET
  - 프로젝트 상세 + escrow + milestones + tokenHoldings count
- [ ] `src/app/api/subscribe/route.ts` — POST
  - 요청: `{ userId, projectId, tokenAmount }`
  - **온체인**: wagmi/viem으로 Escrow 컨트랙트의 `subscribe()` 호출 (테스트넷 ETH 전송)
  - **오프체인 (모의)**: 원화 잔액 차감은 DB에서 시뮬레이션
  - **순서: DB 사전 검증 → 온체인 tx → DB 확정** (불일치 방지)
    1. DB 사전 검증 (온체인 전에 확인):
       - user.balance 확인 → 부족 시 400 에러 (온체인 tx 불필요)
       - project.soldTokens + tokenAmount > totalTokens → 초과 시 400 에러
    2. 온체인 `subscribe()` 호출 → tx receipt 대기
    3. tx 실패 시 → 400 에러 반환 (DB 변경 없음)
    4. tx 성공 시 → Prisma 트랜잭션으로 DB 일괄 업데이트:
       - user.balance -= (tokenAmount * tokenPrice)
       - project.soldTokens += tokenAmount, currentAmount += 투자금
       - escrow.totalLocked += 투자금, remaining += 투자금
       - tokenHolding upsert
       - transaction create (txHash: 실제 온체인 해시)
       - currentAmount >= targetAmount → project.status = 'funded'
  - 응답: `{ success, transaction: { txHash, blockNumber, amount, tokenAmount } }`
- [ ] `src/app/projects/[id]/page.tsx`
  - 상단: 프로젝트 이미지 + 이름 + 위치 + 면적 + 상태뱃지
  - 모집 현황 카드: 프로그레스바 + 금액 + 투자자 수 + 남은 토큰
  - 청약 폼 / 마일스톤 로드맵 / 에스크로 현황 / 최근 거래 내역
- [ ] `src/components/project/subscribe-form.tsx`
  - 지갑 연결 상태 표시 (RainbowKit ConnectButton)
  - 투자자 선택 드롭다운 (데모용)
  - 토큰 수량 입력 → 자동 계산: "× 5,000원 = 총 500,000원"
  - 잔액 표시
  - [청약하기] 버튼 → API 호출 → 트랜잭션 확인 다이얼로그
- [ ] `src/components/project/milestone-stepper.tsx`
  - 수평 4단계 스테퍼
  - 상태: 완료 체크 / AI 검증중 / 진행중 / 대기 / 수동 검토 대기
- [ ] `src/components/project/escrow-summary.tsx`
  - 3개 카드: 총 락업 / 해제 완료 / 잔여
  - 온체인 데이터 표시 (컨트랙트에서 직접 읽기 via viem)
- [ ] `src/components/ui/tx-confirm-dialog.tsx`
  - Tx Hash (Polygonscan Amoy 링크), Block #, Amount, Status

### L2-4-3. 마일스톤 트랜치 해제

#### L3 태스크
- [ ] `src/app/api/milestones/[id]/complete/route.ts` — POST
  - AI 검증 통과 확인 (milestone.aiVerificationResult.passed == true)
  - `milestone.status == 'manual_review'`인 경우 → 관리자 수동 승인 필요 (별도 admin API)
  - **온체인**: Escrow 컨트랙트의 `releaseTranche(seq)` 호출
  - 트랜잭션 성공 시 DB 업데이트:
    1. milestone.status = 'completed', completedAt = now
    2. escrow.totalReleased += releaseAmount, remaining -= releaseAmount
    3. transaction create (txHash: 실제 온체인 해시)
    4. 다음 seq 마일스톤 status = 'in_progress'
    5. 모든 마일스톤(4개) completed → project.status = 'operating'

### L2-4-4. 월 정산 + 수익 배분

> 매출에서 운영비·고정 임대료를 차감한 월 순이익을 투자자·운영자가 나눈다.
> 워터폴(우선순위 배분) 로직은 API에서 처리하고, 온체인 Dividend는 투자자 배분만 담당한다.

#### L3 태스크
- [ ] `src/lib/waterfall.ts` — 월 정산 워터폴 계산 (사업계획서 표9·표10·표11·표13 단위경제 기준)
  - 입력: `{ totalRevenue, projectId }`
  - 배분 순서 (매월 매출에서 순차 차감):
    0. **OPEX 100만원** 차감 (전기 60만 + 재료 40만, 표9)
    1. **건물주 월 고정 임대료 50만원** (매출 무관 고정, 표10) → 우선 지급
       → 매출 − OPEX − 임대료 = **월 순이익** (단위경제 기준 147만원)
    2. **플랫폼 정산 수수료** = 순이익의 1.5% (표13 운영 수수료)
    3. **투자자 배당** = (순이익 − 수수료) × 배당비율 (BEP 전 60~70% / BEP 후 ~40%, 표11)
    4. **운영자 잔여수익** = 나머지 (BEP 전 30~40% / BEP 후 ~60%)
  - 출력: `{ opex, landlordRent, platformFee, investorDividend, operatorResidual, breakdown }`
  - 각 단계는 순차 차감(남은 금액 한도) — breakdown 합계가 매출을 초과하지 않음
  - 참고: 발행 수수료 3%(청약 1회성)·자체몰 유통 10%는 별도 수익원(표13)으로 월 정산 워터폴에는 포함하지 않음
  - 참고: 설비공급사 DRB동일은 사업계획서상 설비 공급·기술 자문 협력사이며 정산 분배 주체가 아님 (정산 주체 = 건물주·투자자·운영자 + 플랫폼 수수료)
- [ ] DB 모델: `ProjectPartner` (id, projectId, role, name, totalContribution, recoveredAmount, monthlyRecoveryAmount, recoveryComplete)
  - 시드: 건물주 최영호 (공간 제공, 월 고정 임대료 50만원). 회수 필드(totalContribution/recoveredAmount/recoveryComplete)는 현재 미사용
- [ ] `src/app/api/dividends/distribute/route.ts` — POST
  - 요청: `{ projectId, totalRevenue }`
  - 순서:
    1. `waterfall.ts`로 워터폴 계산
    2. 투자자 배당분만 → **온체인** Dividend 컨트랙트 `distributeDividend()` 호출
    3. 나머지 (운영자·건물주·플랫폼) → **오프체인** DB 기록
    4. **배당 자동 클레임 (데모 범위 결정)**: DividendClaim을 claimed=true로 생성 + 투자자 잔액 즉시 반영 + dividend 거래 기록 생성 — 라운드별 수동 클레임 UI는 실서비스 단계(L1-11)로
  - 응답: 워터폴 breakdown + 투자자 배당 정보 + txHash
- [ ] `src/components/dashboard/waterfall-chart.tsx`
  - Recharts StackedBarChart — 월 매출의 배분 구조 시각화
  - 색상 구분: 운영비(회색) / 건물주 임대료(파랑) / 플랫폼 수수료(연회색) / 투자자 배당(초록) / 운영자 잔여(보라)

### L2-4-5. 관리자 페이지

#### L3 태스크
- [ ] `src/app/admin/page.tsx`
  - 프로젝트 상태 요약 카드
  - **AI 검증 현황 섹션**
    - 각 마일스톤(4단계): AI 검증 상태 (미검증/통과/거부/수동검토대기) + 검증 상세 결과
    - 마일스톤별 필수 신호 표시 (예: 마일스톤 1 → 계약서 + 영수증 + 사진)
    - 검증 자료 업로드 (계약서 이미지, 영수증 이미지, 현장 사진)
    - [AI 검증 실행] 버튼 → `POST /api/milestones/[id]/verify`
    - 검증 통과 시 [트랜치 해제] 버튼 활성화 → `POST /api/milestones/[id]/complete`
  - **재검증 알림 섹션**
    - 재시도 발생 건 목록 (마일스톤명, 실패 사유, 증빙 자료, 재시도 횟수)
    - 2회 실패 → `manual_review` 상태 건에 대해 [수동 승인] / [반려] 버튼
  - **IoT 이상 알림 섹션**
    - 최근 이상 탐지 이력
    - 이상 감지 시 빨간 뱃지 표시
  - 월 정산 실행 섹션
    - 매출액 input → 워터폴 미리보기 (OPEX·건물주 임대료·플랫폼 수수료·투자자 배당·운영자 잔여 각 몫 표시)
    - [정산 실행] 버튼 → 워터폴 계산 + 투자자 배당 온체인 실행
  - 데모 리셋 섹션
    - [DB 초기화] 버튼 → `POST /api/demo/reset`
- [ ] `src/app/api/demo/reset/route.ts` — POST
  - DB 데이터 전부 초기화 (transactions, tokenHoldings, dividends, iotData 등)
  - 시드 데이터 재생성 — **IoT 60일치 + NAV 스냅샷 포함** (`src/lib/iot-seed.ts` 공용 모듈, 반영됨. 누락 시 마일스톤 2·4 가동률 검증과 대시보드 차트가 빈 상태가 됨)

### L2-4-6. 온체인 연동 모듈 (Amoy 배포 후)

> API 코드 곳곳의 "온체인 호출"을 실제로 구현하는 작업 덩어리. 현재 txHash는 전부 null.
> **설계 결정**: 데모에서는 서버 지갑 1개가 모든 트랜잭션을 서명한다 (투자자별 지갑 주소는 표시용).

#### L3 태스크
- [ ] `src/lib/onchain.ts` — viem walletClient + publicClient 셋업
  - 서버 지갑: `PRIVATE_KEY` env에서 로드 (Amoy 배포 지갑과 동일)
  - 컨트랙트 주소·ABI는 `src/lib/contracts.ts`에서 import
  - 함수: `subscribeOnchain(amount)`, `verifyMilestoneOnchain(seq, passed)`, `releaseTrancheOnchain(seq)`, `distributeDividendOnchain(amount)` — 각각 tx 전송 + receipt 대기 + `{ txHash, blockNumber }` 반환
- [ ] 라우트 연결 (txHash null → 실제 해시):
  - `subscribe` → subscribeOnchain (DB 사전 검증 → tx → DB 확정 순서 유지)
  - `milestones/[id]/verify` → verifyMilestoneOnchain
  - `milestones/[id]/complete` → releaseTrancheOnchain
  - `dividends/distribute` → distributeDividendOnchain (투자자 배당분만)
- [ ] 에스크로 현황은 온체인에서 직접 읽기 (`escrow-summary`, 대시보드 API)
- [ ] DEMO_MODE=cached일 때는 온체인 호출 스킵 (L2-10-1 dryRun 전략과 연동)

---

## L1-5. 라이브 대시보드

> 투자자가 자금이 어디에 얼마나 있는지, 팜이 잘 돌아가는지, 한 화면에서 보는 투명성 UI.

### L2-5-1. 대시보드 API

#### L3 태스크
- [ ] `src/app/api/dashboard/[projectId]/route.ts` — GET
  - project 기본 정보
  - escrow (온체인에서 직접 읽기: totalLocked, totalReleased, remaining)
  - milestones 배열 (AI 검증 상태 포함)
  - transactions 최근 10건
  - tokenHoldings 집계
  - dividends 이력
  - iotData 최신 1건 + 최근 24시간 (48건)
  - ESG 계산값 (areaSqm 기반 CO2 절감량 추정)
  - NAV 계산: `nav-calculator.ts` 호출 → 현재 토큰 가치 + 변동률
  - NAV 이력: 시드 60일치 일별 NAV 스냅샷 (토큰 가치 추이 차트용)

### L2-5-2. 요약 카드 + 자금 흐름

#### L3 태스크
- [ ] `src/components/dashboard/stat-cards.tsx`
  - 5개 카드: 에스크로 잔액 / 총 해제 금액 / 투자자 수 / 누적 배당 / **토큰 현재 가치 (NAV)**
- [ ] `src/components/dashboard/nav-chart.tsx`
  - Recharts LineChart — 토큰 가치 추이 (60일, 일별)
  - 마일스톤 통과 시점에 수직 마커 표시 (점프 구간 시각화)
  - 점진적 우상향 + 마일스톤 점프가 한 눈에 보이는 차트
- [ ] `src/components/dashboard/fund-flow-chart.tsx`
  - Recharts BarChart
  - X축: 이벤트 (청약, 트랜치1~4), Y축: 금액
  - 입금 초록, 출금 주황
- [ ] `src/components/dashboard/milestone-progress.tsx`
  - 수평 4단계 스텝 인디케이터
  - 각 단계에 AI 검증 상태 아이콘 표시 (검증중 스피너 / 통과 체크 / 거부 X / 수동검토 ⚠️)

### L2-5-3. IoT 모니터링

#### L3 태스크
- [ ] `src/components/dashboard/iot-current.tsx`
  - 4개 미니 카드: 온도, 습도, CO2, 광량
  - 이상 탐지 시 빨간 테두리 + 경고 아이콘
- [ ] `src/components/dashboard/iot-chart.tsx`
  - Recharts LineChart (듀얼 Y축: 온도/습도, 24시간)
- [ ] `src/components/dashboard/growth-status.tsx`
  - 생장률 퍼센트 + 재배 작물 목록

### L2-5-4. 트랜잭션 + ESG

#### L3 태스크
- [ ] `src/components/dashboard/tx-list.tsx`
  - shadcn Table
  - Tx Hash (Polygonscan Amoy 링크) | 유형 뱃지 | 금액 | 시간
- [ ] `src/components/dashboard/esg-impact.tsx`
  - CO2 절감 / 푸드마일 감소 / K-ETS 환산

### L2-5-5. 대시보드 페이지 조립

#### L3 태스크
- [ ] `src/app/projects/[id]/dashboard/page.tsx`
  - 1행: StatCards (5개, 토큰 NAV 포함)
  - 2행: NavChart (1/2) + FundFlowChart (1/2)
  - 3행: MilestoneProgress (전폭)
  - 4행: IotCurrent (1/3) + IotChart (2/3)
  - 5행: WaterfallChart (1/2) + GrowthStatus (1/2)
  - 6행: TxList (2/3) + EsgImpact (1/3)
  - 15초 간격 자동 리프레시 (변경: 5초 → 15초, API 과부하 방지)

---

## L1-6. IoT 시뮬레이션 + 이상 탐지

> 실제 센서 없이 현실감 있는 환경 데이터를 만들고, 이상을 자동 탐지한다.

### L2-6-1. IoT 시드 스크립트

#### L3 태스크
- [ ] `prisma/seed-iot.ts`
  - 60일치, 30분 간격 = 약 2,880건 (마일스톤 4의 IoT 60일 조건 충족)
  - 온도: `23 + sin(hour/3) * 2 + random(-0.5, 0.5)` → 22~26°C
  - 습도: `65 + cos(hour/4) * 8 + random(-1.5, 1.5)` → 60~75%
  - CO2: `800 + random(0, 200)` → 800~1000ppm
  - 광량: 06~20시 → `12000 + random(0, 3000)`, 나머지 → 0
  - pH: `6.0 + random(0, 0.5)`
  - 생장률: `min(100, dayIndex * 2.2 + random(0, 3))`
  - 일부 데이터에 의도적 이상치 삽입 (데모용)

### L2-6-2. IoT 실시간 생성 + 이상 탐지

#### L3 태스크
- [ ] `src/app/api/iot/generate/route.ts` — POST
  - 현재 시각 기준 IoT 데이터 1건 생성
  - 생성 후 이상 탐지 API 호출 → anomalyScore, isAnomaly 저장
  - 이상 탐지 시 진행중 마일스톤에 경고 플래그
- [ ] 대시보드 15초 폴링 시 이 API도 호출 → 새 데이터 생성 + 이상 탐지 (IoT 생성은 폴링과 분리하여 별도 버튼 트리거도 가능)

---

## L1-7. 데모 자동 재생

> 심사위원이 버튼만 누르면 전체 STO 사이클을 3분 안에 체험한다.

### L2-7-1. 데모 API

#### L3 태스크
- [ ] `public/demo/` — 데모용 mock 증빙 이미지 (표3 검증 신호 기준)
  - `mock-contract.jpg` — 임대차 계약서 (M1)
  - `mock-receipt-1.jpg` — 설비 구매 영수증 (M1)
  - `mock-receipt-2.jpg` — 판매 영수증 (M3·M4)
  - `mock-photo-1.jpg` — 공간 준비 현장 사진 (M1)
  - `mock-photo-3.jpg` — 수확 사진 (M3)
  - ※ M2는 IoT 단독 검증, M4는 사진 미사용이라 시운전·운영 사진 불필요 (기존 mock-photo-2/4 제거)
- [ ] `src/app/api/demo/step/route.ts` — POST
  - mock 이미지는 `public/demo/`에서 읽어 base64 변환 후 AI 검증 API에 전달
  - 요청: `{ step: number }`
  - step별 로직:
    - **1**: 김민수 500토큰 청약 (온체인 subscribe)
    - **2**: 이서연 250토큰 청약
    - **3**: 박준혁 1,000토큰 청약 → 목표 1,750만원 달성 → funded
    - **4**: 마일스톤 1 "공간 준비" AI 검증 (계약서 + 영수증 + 사진, AND, 영수증↔사진 교차검증) → 통과 → 트랜치 해제 35%
    - **5**: 마일스톤 2 "시운전 + 안정성" AI 검증 (IoT 14일 가동률, 단일 신호) → 통과 → 트랜치 해제 30%
    - **6**: 마일스톤 3 "첫 수확 + 판매" AI 검증 (수확 사진 + 판매 영수증, AND) → 통과 → 트랜치 해제 20%
    - **7**: 배당 분배 (매출 297만, 투자자 배당 비율 70%)
    - **8**: 마일스톤 4 "지속 운영" AI 검증 (IoT 60일 가동률 + 복수 판매 영수증, AND) → 통과 → 트랜치 해제 15% → operating
  - 검증 실패 시 트랜치 해제 없이 실패 결과를 그대로 반환 (강제 verified 처리 금지 — 검증 명제 ①의 신뢰성)
  - **실패 케이스 데모** (선택):
    - **F1**: 영수증 미달(조건 불일치 mock 이미지 사용) → AI 거부 → 컨트랙트 자동 차단
    - **F2**: 관리자 강제 해제 시도 → 컨트랙트 revert
    - **F3**: 재검증 1회 실패 → 관리자 알림 → 2회 실패 → manual_review 전환 → 관리자 수동 승인
  - 응답: 현재 step 결과 + 갱신된 상태

### L2-7-2. 데모 페이지 UI

#### L3 태스크
- [ ] `src/app/demo/page.tsx`
  - 좌측 패널 (1/3): 스텝 진행 목록 (8단계 + 실패 케이스 3개)
    - 상태: 완료(초록) / 현재(파랑 펄스) / 대기(회색)
  - 우측 패널 (2/3): 실시간 상태 미러링
    - 에스크로 잔액 (카운트 애니메이션)
    - 마일스톤 프로그레스 + AI 검증 상태
    - 투자자 목록 + 최근 트랜잭션 (Polygonscan 링크)
  - 하단 컨트롤 바:
    - [처음부터] → reset
    - [다음 단계 ▶] → step 한 단계
    - [자동 재생 ▶▶] → 3초 간격 자동 진행
    - [실패 케이스 보기] → F1, F2, F3 실행
- [ ] 트랜잭션 확인 토스트 (tx_hash + 금액 + Polygonscan 링크, 2초 후 자동 닫힘)
- [ ] 에스크로 카운트다운 애니메이션 (Framer Motion)
- [ ] 최종 완료 화면: 총 투자액, 총 해제액, 총 배당액, 투자자 수익률

---

## L1-8. 랜딩 페이지

> 첫 인상. 심사위원이 URL 열었을 때 5초 안에 이해시킨다.

### L2-8-1. 히어로 + 솔루션

#### L3 태스크
- [ ] 메인 카피: "도심 빈 공간이 스마트팜이 됩니다"
- [ ] 서브 카피: "STO로 소액 투자, 스마트컨트랙트가 자금을 통제, AI가 마일스톤을 검증"
- [ ] CTA 버튼 2개: "프로젝트 둘러보기"(`/projects`), "데모 시작"(`/demo`)
- [ ] 문제 카드 3개: "공실률 15.3%" / "일괄 자금 집행" / "자금 조달 부재"
- [ ] 솔루션 카드 3개: "마일스톤 트랜치" / "AI 검증" / "라이브 대시보드"
- [ ] 시스템 구성도 이미지
- [ ] 하단 CTA 반복

---

## L1-9. 폴리싱 + 배포

### L2-9-1. UX 다듬기

#### L3 태스크
- [ ] 로딩: 스켈레톤 UI
- [ ] 에러: toast 알림
- [ ] 숫자 애니메이션: 금액 변경 시 카운트업/다운 (Framer Motion)
- [ ] 빈 상태: "아직 거래가 없습니다" 안내

### L2-9-2. 반응형

#### L3 태스크
- [ ] 프로젝트 카드: lg 3열 → md 2열 → sm 1열
- [ ] 대시보드: 2~3열 → sm 1열
- [ ] 데모: 좌우 분할 → sm 상하 분할
- [ ] GNB: sm에서 햄버거 메뉴

### L2-9-3. 배포 + QA

#### L3 태스크
- [ ] GitHub 리포 push
- [ ] Vercel 연동 (환경 변수: DATABASE_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY, NEXT_PUBLIC_AMOY_RPC, **NEXT_PUBLIC_BASE_URL** — verify 라우트가 내부 AI API를 self-fetch하므로 미설정 시 localhost로 가서 전부 실패)
- [ ] **Vercel 조기 배포 권장**: 로컬(Windows)에서 `next build`가 한글 경로(`D:\해커톤`) 때문에 EISDIR 에러로 실패함. tsc는 통과하므로 코드 문제는 아니지만, 프로덕션 빌드 검증은 Vercel(Linux)에서만 가능 — L1-9까지 미루지 말고 일찍 1회 배포해서 확인
- [ ] Polygon Amoy 컨트랙트 배포 확인
- [ ] QA: 데모 전체 시나리오 3회 반복 (리셋 → 자동재생 → 실패 케이스 → 완료)
- [ ] QA: 온체인 트랜잭션이 Polygonscan에서 확인되는지 검증
- [ ] QA: AI 검증 → 온체인 기록 → 트랜치 해제 전체 흐름 테스트

---

## L1-10. 시연 준비 (개발 병행)

> 개발 완료 후가 아니라, 각 L1 단계 완료 시점마다 데모가 돌아가는 상태를 유지한다.
> "지금 시연해 보세요" 라는 말에 항상 대응 가능해야 한다.

### L2-10-1. dryRun 모드 — 온체인 리셋 전략 (L1-2 병행)

> 핵심 문제: DB는 리셋 가능하지만 블록체인은 되돌릴 수 없다.
> 해결: 첫 시연에서 실제 온체인 tx를 실행하고, 이후 시연에서는 캐시된 txHash를 반환한다.

#### L3 태스크
- [ ] `src/lib/demo-mode.ts`
  - `DEMO_MODE` 환경변수 (`live` | `cached`)
  - `live`: 실제 온체인 tx 실행 + 결과를 DB `DemoCache` 테이블에 저장
  - `cached`: 온체인 호출 건너뛰고 `DemoCache`에서 txHash 반환
  - Polygonscan 링크는 첫 실행의 실제 tx를 가리키므로 심사위원이 클릭하면 진짜 트랜잭션 확인 가능
- [ ] DB 모델 추가: `DemoCache` (id, step, txHash, blockNumber, result, createdAt)
- [ ] `/api/demo/reset` 수정:
  - DB 데이터 초기화 + 시드 재생성 (기존)
  - `DemoCache`는 초기화하지 않음 (캐시 유지)
  - `DEMO_MODE`를 `cached`로 전환
- [ ] 첫 시연 전: `DEMO_MODE=live`로 1회 전체 실행 → 캐시 적재
- [ ] 이후 시연: `DEMO_MODE=cached`로 자동 전환 → DB만 리셋하면 반복 가능

### L2-10-2. AI 검증 캐시 + fallback (L1-3 병행)

> 핵심 문제: 시연 중 GPT-4o API가 느리거나 터지면 데모가 멈춘다.

#### L3 태스크
- [ ] `src/lib/ai-cache.ts` (반영됨)
  - 전용 `AiCache` 모델에 캐시 (milestoneId + signalType unique → result)
  - 호출 순서: 캐시 확인 → 캐시 있으면 즉시 반환 → 없으면 API 호출 → 결과 캐시 저장
  - 타임아웃: AI API 호출 **15초 초과 시** 캐시된 결과로 자동 fallback (vision 호출이 5초를 넘는 경우가 흔해 5초→15초로 조정)
- [ ] vision 검증 API 3종 (`verify-contract`, `verify-receipt`, `verify-photo`)에 캐시 레이어 적용 (반영됨)
  - `detect-anomaly`는 제외 — 외부 API 호출이 없고(DB 계산) 데이터가 계속 갱신되므로 캐시가 오히려 해로움
- [ ] 데모 리셋 시 AI 캐시도 유지 (DemoCache와 동일 정책)
- [ ] 캐시 히트 시 응답에 `fromCache: true` 플래그 추가 (디버깅용, UI에는 미표시)

### L2-10-3. Mock 증빙 이미지 준비 (L1-3 병행)

#### L3 태스크
- [ ] mock 이미지 수급 방법:
  - 계약서: 인터넷 임대차 계약서 샘플 이미지 + 프로젝트 정보(금정구, 25평≈83㎡)에 맞게 편집
    - **주소·면적 대조가 구현됨** — 계약서에 "금정구" 등 위치 토큰과 면적 83㎡(±20%, 약 66~100㎡)가 실제로 적혀 있어야 통과
  - 영수증: ① 설비(LED·센서·재배대) 구매 영수증(mock-receipt-1, M1) ② 새싹삼 판매 영수증(mock-receipt-2, M3·M4)
    - **conditionText 대조 + 영수증↔사진 교차검증이 구현됨** — mock-receipt-1 항목에 설비 키워드(LED/센서/재배대/관수)가 있어야 마일스톤 1 교차검증 통과
  - 현장 사진: 실내농장/스마트팜 사진 (Unsplash 등 무료 소스) — 공간 준비(M1), 수확(M3)
- [ ] **실패 케이스용 mock 이미지** (F1 시연에 필요):
  - `mock-receipt-fail.jpg` — 마일스톤 조건과 무관한 영수증 (예: 식당 영수증) → AI가 조건 불일치로 거부하는 장면 시연
- [ ] 각 이미지가 AI 검증을 실제로 통과하는지 사전 테스트
  - `verify-contract`: 주소·면적 추출 가능한 해상도인지
  - `verify-receipt`: 금액·항목 추출 가능한지
  - `verify-photo`: 설비 객체(LED, 센서, 재배대) 인식 가능한지
  - **통과 안 되는 이미지는 교체** — 시연 직전이 아니라 L1-3 완료 시점에 확정
- [ ] `public/demo/` 에 최종 이미지 배치 + git 커밋

### L2-10-4. 네트워크 불안정 대비 (L1-4 병행)

#### L3 태스크
- [ ] dryRun `cached` 모드 + AI 캐시가 활성화되면 외부 API 호출 없이 전체 데모 가능 → 오프라인 시연 가능
- [ ] 사전에 `live` 모드로 1회 실행하여 캐시 적재 필수
- [ ] 시연 당일 대비:
  - 모바일 핫스팟 준비 (해커톤 WiFi 백업)
  - Vercel 배포판 + localhost 양쪽 준비 (Vercel 장애 대비)
  - `.env.local`에 API 키 2세트 (OpenAI + Anthropic 이중화)

### L2-10-5. 데모 사전 셋업 체크리스트 (L1-7 병행)

> 시연 전 이 체크리스트를 순서대로 실행하면 데모가 준비된다.

#### L3 태스크
- [ ] 체크리스트 작성 (`docs/demo-checklist.md`):
  ```
  ## 시연 1시간 전
  - [ ] Vercel 배포 상태 확인 (빌드 성공, 환경변수 설정)
  - [ ] Supabase DB 접속 확인
  - [ ] Polygon Amoy RPC 응답 확인
  - [ ] OpenAI / Anthropic API 키 유효성 확인
  - [ ] 테스트넷 지갑에 MATIC 잔액 확인 (faucet: faucet.polygon.technology)

  ## 시연 30분 전
  - [ ] DEMO_MODE=live 설정
  - [ ] /api/demo/reset 호출 → 시드 데이터 생성 확인
  - [ ] 데모 8스텝 + F1~F3 전체 1회 실행 (캐시 적재)
  - [ ] Polygonscan에서 txHash 클릭 → 트랜잭션 확인
  - [ ] DEMO_MODE=cached 전환

  ## 시연 직전
  - [ ] /api/demo/reset 호출 (DB만 리셋, 캐시 유지)
  - [ ] 브라우저 캐시 클리어 + 시크릿 모드
  - [ ] 모바일 핫스팟 대기
  - [ ] localhost:3000 도 열어두기 (Vercel 장애 대비)
  ```

### L2-10-6. 시연 시나리오 대본 (L1-8 병행)

#### L3 태스크
- [ ] 시연 대본 작성 (`docs/demo-script.md`):
  - **도입 (30초)**: 문제 제기 — 공실률, 기존 STO의 일괄 집행 문제
  - **핵심 시연 (2분)**:
    - 데모 페이지 → [자동 재생] → 청약 3건 실행 → 에스크로 락업 확인
    - 마일스톤 1~4 검증 → AI 판정 과정 표시 → 트랜치 자동 해제
    - Polygonscan 링크 클릭 → 실제 온체인 트랜잭션 확인
    - 배당 분배 실행
  - **차별점 시연 (1분)**:
    - 실패 케이스 F1: 영수증 미달 → 자금 차단 (검증 명제 ①)
    - 실패 케이스 F2: 관리자 강제 시도 → revert (검증 명제 ②)
    - 실패 케이스 F3: 재검증 실패 → 관리자 알림 → 수동 검토
  - **대시보드 (30초)**: 라이브 대시보드에서 에스크로·IoT·ESG 한 눈에
  - **마무리 (30초)**: 수익 모델 + DRB동일 연계 + 확장 로드맵

---

## L1-11. 실서비스 확장 항목 (해커톤 이후 개발)

> ⚠️ **중요도가 낮아서가 아니라, 개발 시점을 뒤로 미루는 항목들이다.**
> 실제 STO 서비스로 가려면 대부분 필수다. 해커톤 데모 범위에서 빠졌을 뿐, 우선순위(중요도) 자체는 높다.
> 시점: 해커톤 종료 후 / 실서비스 전환 단계.

### L2-11-1. 인증·인가 (중요도: 높음)
- [ ] 사용자 로그인/회원가입 (현재는 데모용 드롭다운 선택으로 대체)
- [ ] 세션/JWT 토큰 관리
- [ ] 역할 기반 권한(RBAC) — 투자자/건물주/운영자/관리자 API 접근 제어
- [ ] 관리자 페이지 인증 보호 (현재 무인증 노출)

### L2-11-2. 결제 입출구 (중요도: 높음)
- [ ] 원화 입금/출금 실연동 (현재 DB 잔액 시뮬레이션)
- [ ] PG사/가상계좌 연동
- [ ] 정산·환불 실제 송금 처리

### L2-11-3. 규제·컴플라이언스 (중요도: 높음)
- [ ] KYC/AML (실명·신원 인증)
- [ ] 투자자 적격성 검증 (투자 한도)
- [ ] 공시·감사 로그 (거래·집행 내역 감사 추적)
- [ ] 약관·전자서명

### L2-11-4. 온체인 견고성 (중요도: 높음)
- [ ] 서버 지갑 키 관리 (KMS/HSM, 현재 .env PRIVATE_KEY)
- [ ] 트랜잭션 재시도·nonce 관리·가스 추정
- [ ] 메인넷 전환 (현재 Amoy 테스트넷)
- [ ] 컨트랙트 외부 감사(audit)

### L2-11-5. 운영·인프라 (중요도: 중간)
- [ ] 알림 시스템 실연동 (이메일/푸시, 현재 DB Notification 레코드만)
- [ ] 로깅·모니터링·에러 추적 (Sentry 등)
- [ ] API 레이트리밋·보안 헤더
- [ ] 자동화 테스트 + CI 파이프라인
- [ ] API 명세 자동화 (OpenAPI/Swagger — 현재 `docs/api-spec.md` 수동 관리)

### L2-11-6. 확장 기능 (중요도: 중간)
- [ ] 다중 프로젝트 관리 (생성/수정/마감, 현재 단일 프로젝트)
- [ ] 토큰 2차 거래(유통시장)
- [ ] 배당 라운드별 수동 클레임 UI (데모는 분배 시 자동 클레임으로 처리 — L2-4-4 참고)
- [ ] Dividend 컨트랙트 스냅샷 방식 전환 (현재 클레임 시점 잔고 기준 — 토큰 이동 시 중복 수령 가능)
- [ ] Escrow 환불 시 토큰 소각 처리 (현재 환불 후에도 토큰 보유)
- [ ] Vesting 컨트랙트 실사용 연동 (L2-2-4에서 보류됨)

---

## 검증 명제 매핑

2차 계획서 표 3에서 정의한 검증 명제가 코드의 어디에서 구현되는지 추적.

| 검증 명제 | 구현 위치 | 데모 시연 |
|---|---|---|
| ① 마일스톤 미달 시 자금이 풀리지 않음 | `Escrow.sol`: releaseTranche에서 `require(milestone.verified == true)` | 데모 F1: 영수증 미달 → AI 거부 → 컨트랙트 차단 |
| ② 사람의 임의 개입으로 자금 풀림 강제 불가 | `Escrow.sol`: verifyMilestone은 VERIFIER_ROLE만, releaseTranche는 verified 필수 | 데모 F2: 관리자 강제 호출 → revert |
| ③ 마일스톤 통과 시 추가 승인 없이 자동 집행 | `POST /api/milestones/[id]/complete`: AI 통과 → 온체인 releaseTranche 자동 호출 | 데모 step 4~8: 검증 통과 → 자동 해제 → txHash 발급 |

---

## 파일 구조

```
FarmFi/
├── contracts/                          # Foundry 프로젝트
│   ├── src/
│   │   ├── FarmToken.sol
│   │   ├── Escrow.sol
│   │   ├── Dividend.sol
│   │   └── Vesting.sol
│   ├── test/
│   │   ├── FarmToken.t.sol
│   │   ├── Escrow.t.sol
│   │   ├── Dividend.t.sol
│   │   └── Vesting.t.sol
│   ├── script/
│   │   └── Deploy.s.sol
│   └── foundry.toml
│
├── frontend/                           # Next.js 14
│   ├── public/
│   │   └── demo/                       # 데모용 mock 증빙 이미지
│   │       ├── mock-contract.jpg       # M1 임대차 계약서
│   │       ├── mock-receipt-1.jpg      # M1 설비 구매 영수증
│   │       ├── mock-receipt-2.jpg      # M3·M4 판매 영수증
│   │       ├── mock-photo-1.jpg        # M1 공간 준비 사진
│   │       └── mock-photo-3.jpg        # M3 수확 사진
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── providers.tsx
│   │   │   ├── page.tsx                # 랜딩
│   │   │   ├── projects/
│   │   │   │   ├── page.tsx            # 목록
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx        # 상세 + 청약
│   │   │   │       └── dashboard/page.tsx
│   │   │   ├── demo/page.tsx
│   │   │   ├── admin/page.tsx
│   │   │   └── api/
│   │   │       ├── projects/
│   │   │       ├── subscribe/route.ts
│   │   │       ├── milestones/[id]/
│   │   │       │   ├── verify/route.ts     # AI 검증
│   │   │       │   └── complete/route.ts   # 트랜치 해제
│   │   │       ├── dividends/
│   │   │       ├── dashboard/[projectId]/route.ts
│   │   │       ├── ai/
│   │   │       │   ├── verify-contract/route.ts
│   │   │       │   ├── verify-receipt/route.ts
│   │   │       │   ├── verify-photo/route.ts
│   │   │       │   └── detect-anomaly/route.ts
│   │   │       ├── admin/
│   │   │       │   └── notify/route.ts
│   │   │       ├── iot/generate/route.ts
│   │   │       └── demo/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   ├── project/
│   │   │   ├── dashboard/
│   │   │   └── ui/
│   │   └── lib/
│   │       ├── db.ts
│   │       ├── wagmi-config.ts
│   │       ├── contracts.ts
│   │       ├── abi/                    # 컨트랙트 ABI JSON
│   │       ├── format.ts
│   │       └── constants.ts
│   └── prisma/
│       ├── schema.prisma
│       ├── seed.ts
│       └── seed-iot.ts
│
├── iot-mock/                           # Python
│   ├── anomaly_detector.py
│   └── requirements.txt
│
└── docs/
    ├── README.md
    ├── plan.md
    ├── api-spec.md
    ├── dev-report.md
    ├── dev-log.md
    └── images/
```
