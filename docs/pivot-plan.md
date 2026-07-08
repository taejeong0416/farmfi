# 팜피 코드베이스 전환 플랜 — STO 자금통제 → 도심팜 운영 인프라(DID/VC)

**문서 성격:** 실행 전 계획서. **아직 코드를 바꾸지 않았다.** 다음 작업 세션이 이 문서를 열어 이어서 전환 작업을 수행하기 위한 핸드오프 문서다.

**대상:** 이 레포(`pnuai-b-01-b301`) 전체. 이 문서 위치: `docs/pivot-plan.md`.
**전환 목표(Source of truth, 레포 외부):**
- `D:\해커톤\팜피_통합_사업계획서_v4.md`
- `D:\해커톤\팜피_해커톤용_기술사업계획서_운영계약보강.md`

**현재 코드 근거:** `pnuai-b-01-b301/README.md`, `docs/plan.md`, `frontend/prisma/schema.prisma`, `frontend/src/app/api/**`, `contracts/src/**`

---

## 0. 한 줄 요약

현재 코드베이스는 **"정책자금을 에스크로에 넣고 마일스톤을 AI가 검증해 트랜치로 자동 집행하고 조합원에게 배당하는 자금통제 플랫폼"**이다. 새 방향은 **"기관·기업이 도입비·운영관리비를 내고, 팜피가 운영 표준·판로·DID/VC 실적검증·ESG 리포트를 제공하는 도심팜 운영 인프라"**다. 블록체인의 용도가 **자금 집행 통제 → 실적 증명(VC 해시) 앵커링**으로 바뀌는 것이 전환의 중심축이다.

---

## 1. 컨셉 차이 (무엇이 바뀌나)

| 축 | 현재 코드 (AS-IS) | 새 방향 (TO-BE) |
|---|---|---|
| 정체성 | 마일스톤 조건부 자금 집행 플랫폼 | 도심팜 운영 인프라 서비스 |
| 지불 고객 | (명목상) 투자자 / 실질 재원=정부지원금·신보·조합 자부담 | **기관·기업**(공공기관·대학·ESG 기업) |
| 블록체인 용도 | 토큰 발행·에스크로 락업·트랜치 자동집행·배당 | **VC 해시 앵커링**(실적 위변조 방지·제3자 검증) |
| 핵심 산출물 | 자금이 잘못 풀리지 않음을 코드로 증명 | 운영자 실적을 검증 가능한 디지털 증명(VC)으로 전환 |
| 신원 | SIWE 지갑 로그인 + KYC 필드 | **모바일 신분증 → DID → VC** |
| 참여자(운영자) | 영농조합 조합원(지분·배당 대상) | **인증 운영자**(활동비/급여, 실적 인증 — 창업 리스크 없음) |
| 수익모델 | 정산 워터폴 수수료·자체몰 유통 | 도입비·월 운영관리비·검증/리포트 이용료·납품 수수료 |
| 데모 스토리 | 예치→검증→트랜치→배당 (자금 사이클) | 모바일신분증→실적검증→VC발급→앵커링→기관 ESG 리포트 |

> 새 기획서는 **"블록체인은 투자·토큰 발행 기술이 아니다"**라고 명시적으로 선을 긋는다. 따라서 현재의 FarmToken/Escrow/Dividend(투자·정산 기계)는 새 방향의 핵심이 아니다.

### 1-1. 최우선 미결 결정 (이걸 정하지 않으면 착수 불가)

1. **지정과제 트랙 정합성 (최대 리스크).** 현재 README는 *지정과제트랙 (DRB동일)*이고 STO·에스크로 데모 전체가 DRB 연계(동일토건 시공·DRB오토메이션 IoT·DRB동일 ESG)로 짜여 있다. 새 방향에는 DRB가 없다. **전환이 트랙 심사 요건을 깨는지** 먼저 확인해야 한다. (트랙 유지가 필수라면 새 방향은 "자유트랙용 별도 산출물"이 되어야 할 수도 있다.)
2. **기존 STO 코드 처리:** 완전 삭제 vs 아카이브(브랜치/폴더 보존 후 데모 표면에서만 제거). → **보존 권장**(되돌릴 여지).
3. **온체인 범위:** VC 해시 앵커용 경량 Anchor 컨트랙트만 배포할지, OmniOne/OpenDID 테스트넷을 쓸지.
4. **로그인 수단:** 기존 SIWE 지갑 로그인을 유지할지, 모바일신분증/DID 온보딩으로 대체할지.

---

## 2. 컴포넌트별 영향도 (Keep / Adapt / Drop / Add)

### 2-1. 스마트컨트랙트 `contracts/`

| 항목 | 처리 | 메모 |
|---|---|---|
| `src/FarmToken.sol` | **Drop(보존)** | 조합 지분 토큰 — 새 모델에 불필요. 삭제 말고 아카이브. |
| `src/Escrow.sol` | **Drop(보존)** | 트랜치 자금통제 — 새 모델의 핵심 아님. |
| `src/Dividend.sol` | **Drop(보존)** | 배당 정산 — 제거. |
| `script/Deploy.s.sol`, `test/**` | **Drop(보존)** | 위 3개에 종속. |
| (신규) `src/AnchorRegistry.sol` | **Add** | `anchor(bytes32 vcHash, string vcId)` + 이벤트만 있는 경량 레지스트리. VC 해시·발급로그 기록. Amoy 배포. |

### 2-2. 데이터 모델 `frontend/prisma/schema.prisma`

| 모델 | 처리 | 세부 |
|---|---|---|
| `User` | **Adapt** | `role`을 `institution`(기관담당자)/`operator`/`admin`으로. KYC/DID 필드(`identityVerified`,`realName`,`birthDate`,`verifiedAt`)는 **유지**(DID 온보딩에 그대로 맞음). 투자 필드(`balance`,`investorAnnualLimit`,`businessRegNo`) 제거. |
| `IdentityVerification` | **Keep** | OpenDID Verifier 세션 구조 — 새 모델에 딱 맞음. 확장만. |
| `OperatorApplication` | **Keep** | 인증 운영자 온보딩. status 흐름(`applied→docs→education→matched→operating`) 재사용. |
| `Space` | **Keep** | 유휴공간 등록(기관 공간). `estimatedRent` 등 임대수익 뉘앙스만 조정. |
| `IotData` | **Keep** | 운영 모니터링·작업검증 보조. |
| `Notification` | **Keep** | 그대로. |
| `Project` | **Adapt→개명** | "투자 프로젝트"→"기관 도입 프로그램/도심팜 사이트". 토큰·목표액·소진율 필드(`tokenSymbol`,`tokenPrice`,`totalTokens`,`soldTokens`,`targetAmount`,`currentAmount`,`totalCapex`) 제거. `institutionId`, 도입비, 월 운영관리비, 계약기간 추가. |
| `Milestone` | **Adapt** | 트랜치 집행 조건 → 운영 이벤트/검증 단위로 부분 재사용. `requiredSignals`,`aiVerificationResult`,`crossCheck`는 VC 발급 조건으로 재활용. `releasePct`,`releaseAmount`,`assetValue` 제거. |
| `Escrow` | **Drop** | 자금 락업 회계 — 제거. |
| `Dividend`,`DividendClaim` | **Drop** | 배당 — 제거. |
| `TokenHolding` | **Drop** | 지분 보유 — 제거. |
| `NavSnapshot` | **Drop** | 토큰 NAV — 제거. |
| `ProjectPartner` | **Adapt/Drop** | 회수(recovery) 로직 제거. 파트너(설비·구매처·대학) 개념만 필요하면 경량 재정의. |
| `Transaction` | **Adapt** | `type`에서 `subscription/tranche_release/dividend/revenue` 제거. 납품·정산 기록이 필요하면 별도 모델로. |
| `AiCache`,`DemoCache` | **Keep** | 시연 안정성 인프라 — 재사용. |
| (신규) `Institution` | **Add** | 기관·기업 고객(계약·도입비·운영관리비·담당자). |
| (신규) `VerifiableCredential` | **Add** | `vc_id, holder_did, issuer_did, type, issued_at, hash, status`. (해커톤 문서 §7-1 스펙 채택) |
| (신규) `BlockchainAnchor` | **Add** | `anchor_id, vc_id, hash, tx_id, anchored_at`. |
| (신규) `TrainingRecord` | **Add** | 교육 수료 → 교육 수료 VC. |
| (신규) `WorkLog` | **Add** | 작업일지(사진·체크리스트·시간) → 작업 참여 VC. |
| (신규) `HarvestRecord` | **Add** | 수확 기록 → 수확 실적 VC. |
| (신규) `DeliveryRecord` | **Add** | 납품(영수증 OCR·구매처 확인) → 납품 실적 VC. |
| (신규) `ESGReport` | **Add** | 기관 월간 성과 리포트(`metrics_json`). |

> 신규 엔티티 필드 정의는 **해커톤 문서 §7-1(주요 엔티티)**에 이미 있으니 그대로 채택.

### 2-3. API 라우트 `frontend/src/app/api/`

| 라우트 | 처리 | 메모 |
|---|---|---|
| `auth/siwe/**`, `auth/me`, `auth/logout` | **Keep/Adapt** | 지갑 로그인 유지 or DID 로그인으로 교체(미결 결정 #4). |
| `identity/offer`, `identity/status` | **Keep** | DID/모바일신분증 Verifier 흐름 — 확장. |
| `ai/verify-receipt` | **Keep** | 납품 영수증 OCR → 납품 VC 발급 조건. |
| `ai/verify-photo` | **Keep** | 작업·수확 사진 검증 → 작업/수확 VC 조건. |
| `ai/detect-anomaly` | **Keep** | 운영 모니터링 보조. |
| `ai/verify-contract` | **Adapt/Drop** | 임대차 계약 OCR → 기관 계약/공간 확인 용도로 전용 or 제거. |
| `operator-applications`, `spaces`, `upload`, `admin/notify` | **Keep** | 재사용. |
| `subscribe` | **Drop** | 소액 청약(온체인 예치) — 제거. |
| `dividends/distribute` | **Drop** | 배당 분배 — 제거. |
| `portfolio` | **Drop** | 투자 포트폴리오 — 제거. |
| `milestones/[id]/complete` | **Drop/Adapt** | 트랜치 해제 — 제거. 운영 이벤트 완료로 재정의 가능. |
| `milestones/[id]/verify` | **Adapt** | 다중신호 AND 검증 로직은 **VC 발급 조건 검증**으로 재활용(핵심 자산). |
| `dashboard/[projectId]` | **Adapt** | 자금 대시보드 → 기관 ESG 성과 대시보드. |
| `demo/step`, `demo/reset` | **Adapt(재작성)** | 자금 사이클 데모 → VC 실적 데모(§5 참조). |
| (신규) `vc/issue`, `vc/verify` | **Add** | VC 발급/검증. |
| (신규) `anchor` | **Add** | VC 해시 온체인 앵커링(AnchorRegistry 호출). |
| (신규) `worklog`, `training`, `delivery` | **Add** | 작업·교육·납품 기록 제출 → 검증 → VC. |
| (신규) `reports/[institutionId]` | **Add** | ESG/지역상생 월간 리포트 생성. |

### 2-4. 프론트엔드 `frontend/src/app/**`, `components/farmfi/**`

| 화면/컴포넌트 | 처리 | 메모 |
|---|---|---|
| `verify-identity/`, `identity/**` | **Keep** | DID/모바일신분증 온보딩. |
| `operator/`, `operator/apply/` | **Keep/Adapt** | 인증 운영자 온보딩 → 운영자 앱으로 확장. |
| `admin/`, `admin/**` | **Adapt** | 기관/운영 관리 대시보드로. 마일스톤 검증 패널은 VC 발급 검증 패널로 전용. |
| `space/`, `landlord/**` | **Keep/Adapt** | 유휴공간(기관 공간) 등록·현황. |
| `dashboard/`, `dashboard/**` | **Adapt** | ESG 성과 대시보드로 재구성(§7-4 지표). |
| `demo/`, `demo/**` | **Adapt(재작성)** | VC 실적 데모로. |
| `portfolio/`, `portfolio/**` | **Drop** | 투자 포트폴리오·배당·회수 진행률 — 제거. |
| `market/`, `projects/**`(청약), `transparency/` | **Drop/Adapt** | 투자 청약·투명성(자금) 화면 제거. `projects`는 "도입 프로그램/사이트 목록"으로 재정의 가능. |
| `WalletConnectPanel`, `TokenHoldingsPanel`, `SubscribeForm`, `Dividend*`, `EscrowSummary`, `MilestoneStepper`(트랜치) | **Drop** | 투자·정산 UI 제거. |
| (신규) 운영자 앱 화면 | **Add** | 교육 수료, 작업일지 제출, 수확·납품 등록, 발급 VC 목록. |
| (신규) VC/검증 화면 | **Add** | VC 발급 완료, 블록체인 검증(해시·발급시각·상태). |
| (신규) 기관 ESG 리포트 화면 | **Add** | 월간 성과 요약(§7-4). |

### 2-5. 기타

- `contracts/broadcast`, `cache`, `frontend/.next` : 재배포 시 갱신 — 무시.
- `iot-mock/` : 유지(참고용).
- `README.md`, `CLAUDE.md`, `docs/plan.md`, `docs/api-spec.md`, `docs/verification-spec.md` : **새 방향으로 재작성 필요**(Phase 6). 현재 전부 STO 서술.

---

## 3. 재사용 가능한 핵심 자산 (버리지 말 것)

새 방향으로 옮겨도 **그대로 살아남는** 값진 코드:

1. **다중신호 AND 검증 파이프라인** (`milestones/[id]/verify` + `ai/verify-*` + `crossCheck` 교차검증) → 그대로 **VC 발급 조건 검증**으로 전용. 새 모델의 핵심이 바로 "실적을 검증해 VC로". **이게 최대 자산.**
2. **OpenDID Verifier 세션** (`IdentityVerification`, `identity/offer|status`) → 모바일신분증·DID 온보딩에 직결.
3. **AI 캐시 + fallback + 데모 캐시** (`AiCache`, `DemoCache`, `demo-mode.ts`) → 시연 안정성 인프라 재사용.
4. **영수증 OCR / 사진 Vision / IoT 이상탐지** → 납품·작업·수확 VC 검증에 재사용.
5. **역할 기반 인증·업로드·알림** 인프라.

---

## 4. 단계별 실행 플랜 (다음 세션은 이 순서로)

### 4-0. 브랜치 전략 (전환은 브랜치에서, 나중에 머지)

전환 작업은 `main`에 직접 하지 않는다. **전용 브랜치에서 진행하고 완성 후 PR로 머지**한다.

- **브랜치:** `feat/pivot-operation-infra` — **`main`에서 이미 분기해 둠**(기존 `feat/*` 컨벤션).
- **이 플랜 문서:** `main`에 커밋됨(`docs/pivot-plan.md`). 브랜치도 이를 상속하므로 어디서든 참조 가능.
- **커밋:** 각 Phase = 하나의 논리 단위 커밋. `feat:`/`refactor:`/`docs:` 접두, 무관한 변경 섞지 않기(레포 `CLAUDE.md` 규칙).
- **머지:** Phase 6까지 끝나고 Vercel 빌드·데모가 통과하면 PR 생성 → 머지. `main`은 항상 시연 가능한 상태 유지.
- **롤백 여지:** 기존 STO 코드는 삭제가 아니라 아카이브(§2-1) — 머지 후에도 이전 모델로 되돌릴 수 있게.

> **⚠️ Phase 1 착수 전 정리:** `main`에 커밋되지 않은 `docs/plan.md` 수정(M)이 남아 있다(이 전환 작업의 산출물 아님). 브랜치로 `switch`하기 전에 **먼저 그 변경을 커밋하거나 stash**해서 전환 브랜치에 섞이지 않게 한다.

```bash
# 브랜치는 이미 생성됨. Phase 1 착수 시:
cd pnuai-b-01-b301
git status                 # main의 docs/plan.md(M) 먼저 정리(commit 또는 stash)
git switch feat/pivot-operation-infra
# Phase 1~6 작업 + Phase별 커밋
# 완료 후 (push는 사용자 요청 시에만)
git push -u origin feat/pivot-operation-infra
# GitHub에서 PR → main 머지
```

### 4-1. Phase 목록

각 Phase는 브랜치 위 독립 커밋 단위. **Phase 0을 먼저 사람이 결정**해야 나머지가 의미 있다.

- **Phase 0 — 방향 확정 (문서/결정, 코드 X)**
  검증: §1-1의 미결 결정 4개 확정. 특히 지정과제 트랙 정합성. → 확정 결과를 이 문서 상단에 추가.
- **Phase 1 — 데이터 모델 전환** (`schema.prisma`)
  검증: `prisma db push` 통과 + seed 재작성 후 `prisma db seed` 성공. 투자 모델 제거, VC/실적 모델 추가.
- **Phase 2 — DID/VC 코어 + Anchor 컨트랙트**
  검증: 모바일신분증(시뮬레이션) → DID 생성 → 본인확인 VC 발급 → 해시 앵커링(tx_id 확인)까지 1줄 흐름 통과.
- **Phase 3 — 운영자 앱 (교육·작업·납품 → VC)**
  검증: 교육 수료 VC / 작업 VC / 납품 VC 각각 발급 + 검증 통과. 다중신호 검증 파이프라인 재사용 확인.
- **Phase 4 — 기관 대시보드 + ESG 리포트**
  검증: 기관 계정에서 운영자 수·작업시간·수확·납품·VC 발급 수·검증 링크가 월간 리포트로 집계.
- **Phase 5 — 데모 재구성**
  검증: §5 데모 흐름이 리셋→자동재생으로 3분 내 완주.
- **Phase 6 — 컨트랙트 정리 + 문서 정합 + 머지**
  검증: STO 컨트랙트/코드 아카이브, AnchorRegistry Amoy 배포, README/CLAUDE.md/plan.md/api-spec/verification-spec 새 방향으로 재작성, `next build`(Vercel) 통과 → PR 생성 → `main` 머지.

---

## 5. 새 데모 시나리오 (교체 대상)

해커톤 문서 §6 기준. 기존 "예치→트랜치→배당" 8스텝을 아래로 교체:

1. 운영자 앱 접속 → 모바일 신분증 본인확인 → DID 생성 → **본인확인 VC**
2. 스마트팜 운영 교육 수료 → **교육 수료 VC**
3. 오늘의 작업 체크리스트 + 사진 제출 → AI/규칙 검증 → **작업 VC/로그 해시**
4. 마이크로그린 수확 → 지역 카페 납품 → 영수증 OCR + 구매처 확인 → **납품 실적 VC** + 해시 앵커링
5. 기관 담당자 대시보드에서 검증된 실적 확인 → **ESG/지역상생 리포트 자동 생성**

실패 케이스(선택): 동일 사진 재사용/무관 사진 → AI 거부, 중복 납품 실적 → 앵커 중복 감지.

---

## 6. 리스크 / 주의

- **지정과제 트랙 이탈 리스크(최상)**: §1-1 #1. 전환 착수 전 반드시 확인.
- **범위 폭증**: VC·DID·운영자앱·기관대시보드·리포트를 한 번에 = 4명 팀에 과함. 해커톤 문서 §5-2가 이미 "구현하지 않을 것"을 규정 — 그 경계 준수. 핵심 흐름(모바일신분증→검증→VC→앵커링→리포트)만.
- **모바일 신분증 실연동 제약**: 데모는 시뮬레이션/샌드박스, 실제는 OpenDID 구조로 설명(해커톤 문서 §14 리스크표와 동일).
- **빌드 함정**: 로컬(Windows, 한글 경로 `D:\해커톤`)에서 `next build`가 EISDIR로 실패 — 프로덕션 빌드 검증은 Vercel(Linux)에서. (`docs/plan.md` L2-9-3 기록)
- **Prisma 7 driver adapter**: `new PrismaClient()` 무인자 금지, `PrismaPg` 주입(`src/lib/db.ts`). datasource url은 `prisma.config.ts`.

---

## 7. 다음 세션 착수 지점

> Phase 0(§1-1 결정)이 끝났다면 → **먼저 §4-0대로 `main` 정리 후 `feat/pivot-operation-infra` 분기** → **Phase 1: `frontend/prisma/schema.prisma` 전환부터.** §2-2 표를 그대로 작업 목록으로 사용하고, 신규 엔티티 필드는 해커톤 문서 §7-1에서 가져온다. 재사용 자산(§3)은 삭제하지 말 것.
