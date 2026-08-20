# 개발 계획 · 웹 화면 62개 + 기능

Figma 화면을 옮기면서, 그 화면이 실제로 도는 데 필요한 API·모델을 같이 만든다. 화면과 기능을 짝으로 완성해 어느 시점에 멈춰도 그 지점까지는 동작하는 데모가 되게 한다.

## 범위

이 문서는 웹(`frontend/`)만 다룬다 — 웹 화면 62개와 웹이 호출하는 API.

운영자 앱(`app/`)과 앱만 호출하는 API는 다른 담당이 맡는다. 앱 전용 경로(증빙 촬영 제출, 매장 컨텍스트·생육·재고 쓰기, 설비 연결·임계값·제어 명령, 픽업 바코드 스캔·수령 처리)는 `frontend/src/app/api`에 들어오더라도 여기서 계획하지 않는다. 앱과 웹이 같은 서버·같은 DB를 쓰므로 스키마가 겹치면 `prisma/schema.prisma`에서 만난다.

**`design/farmfi-web.fig`는 잠정본이다.** 코드에 옮긴 화면은 전부 이 잠정본을 보고 그렸고, 디자인 최종본이 오면 화면 목록·생김새·문구가 달라질 수 있다. Phase A~K의 체크는 "잠정본 기준으로 이식과 검증을 끝냈다"는 뜻이지 "최종 디자인과 일치한다"는 뜻이 아니다. 최종 디자인 반영 여부는 Phase N의 체크가 말한다.

추출한 화면 트리는 `design/screens/farmfi-web/<페이지>/<화면>.txt`에 있다. 한 줄이 노드 하나이고 절대좌표·크기·색·폰트가 그대로 적혀 있다. Figma가 갱신되면 `.fig`를 교체하고 `python tools/figma/extract.py`를 다시 돌린다. `design/screens/`의 diff가 무엇이 바뀌었는지 알려주는 1차 자료다.

## 이어서 하기

**다음 작업 = 아래에서 체크 안 된 첫 항목.**

작업 단위 하나를 끝낼 때마다:
1. `- [ ]`를 `- [x]`로 바꾸고
2. 검증(`npx tsc --noEmit` + `npm run dev` 육안)을 통과시킨 뒤
3. 그 단위만 커밋한다 (`feat:` / `fix:` / `docs:` 접두)
4. 판단이 갈렸던 지점은 `dev-log.md` 맨 위에 한 줄 남긴다

세션이 바뀌어도 이 파일의 체크 상태가 진행 상황의 정본이다. Phase N은 최종 `.fig`가 들어와야 시작할 수 있으니, 파일이 오기 전에는 Phase P부터 잡는다.

## 원칙

디자인이 기준이다. Figma 화면 목록과 생김새를 그대로 옮긴다. 기능명세서는 Figma가 표현할 수 없는 것(API·상태·권한·금지 용어)에만 적용한다. 잠정본과 최종본이 어긋나면 최종본을 따른다.

| 항목 | 결정 |
|---|---|
| 화면 목록 | 잠정본 62개 — 최종본에서 증감·ID 변경 가능 |
| 생김새 | 잠정본 `.fig`가 기준 (좌표·색·폰트·radius) — 아래 그라운드 룰과 최종본이 이기는 경우만 예외 |
| 데이터 층 | 기존 `components/farmfi/**/api.ts` 재사용. 없는 것만 신규 |
| 스타일링 | Tailwind + `tailwind.config.ts` 토큰 |
| Figma에 없는 6개 | Phase J에서 Figma 톤으로 재디자인 |

### 명세가 디자인을 이기는 3가지

Figma가 v2.1 용어 패치 이전 버전이라 금지 용어가 남아있다. 문구만 교체하고 레이아웃은 유지한다.

1. **금지 용어** — 화면 11개에 잔존: `토큰`(I-01·I-07·I-08), `지갑`(A-15·I-01·I-07·O-03·O-07), `배당`(8개), `락업`(I-04), `증권`(I-01).
   → `투자 금액` / `보유 구좌` / `회수금·지급 예정액` / `등록 계좌` / `모바일 신분증 확인`
2. **O-11·A-08은 P0** — Figma는 Phase 2 존에 그렸지만 `team-handoff-v2.1.md` 2-D가 "존 위치와 무관하게 MVP"로 명시
3. **I-07 보유 표기** — `보유 수량·토큰` → `투자 금액 / 보유 구좌 / 계약 상태`

## 그라운드 룰

Figma를 그대로 옮기되, 아래 세 가지만 바꾼다.

### 색

Figma에는 상태를 여러 색으로 나눈 흔적과 틴트가 남아있다 — 노랑 13종, 파랑 4종, 연한 빨강 배경 3종. 이것만 걷어낸다.

| 역할 | 값 | 어디에 |
|---|---|---|
| ink | `#1A1A1A` | 본문·제목 |
| body | `#4A4A4A` | 보조 본문 |
| muted | `#8A8A8A` | 라벨·비활성 |
| line | `#E5E5E3` | 테두리 |
| line-soft | `#EDEDEB` | 구분선 |
| surface | `#F2F2F0` | 면 |
| brand | `#14542E` | 버튼·링크·활성 탭·통과·강조 |
| brand-soft | `#EAF6EE` | 브랜드 강조의 옅은 배경 |
| danger | `#A34A3D` | 실패·거부·삭제 |

- 상태를 여러 색으로 등급 매기지 않는다. 글자로 말한다.
- 제3자 브랜드 로고(B-05 결제수단)는 원본 색을 쓴다.
- 원본 색을 이 팔레트로 옮기는 표는 `figma-color-map.md`. 팔레트 밖 색이 1,746개 노드지만 대부분 초록·회색의 명도 변종이고, 실제로 바꿀 것은 94개다.
- 앱도 같은 팔레트를 쓴다. 값이 갈리면 이 표가 기준이다.

### 용어

`team-handoff-v2.1.md`의 금지 용어를 따른다. 문구만 교체하고 레이아웃은 유지한다.

### 데스크톱 먼저

반응형은 나중에 붙인다. 지금은 데스크톱(1440)만 확인한다.

구현은 절대좌표 대신 `max-width` + flex/grid + `rem`으로 짠다. 나중에 브레이크포인트만 추가하면 되고, 루트 폰트 크기 하나로 전체 크기를 조절할 수 있다. Figma 덤프의 좌표는 간격을 읽는 용도지 그대로 옮길 값이 아니다 — `@33,442`와 `@207,442`는 "왼쪽 여백 33, 두 버튼 사이 10"으로 읽는다.

## 디자인 토큰

`.fig`에서 추출한 실제 값에 그라운드 룰을 적용한 것.

```
색     ink #1A1A1A · body #4A4A4A · muted #8A8A8A
       line #E5E5E3 · line-soft #EDEDEB · surface #F2F2F0
       brand #14542E · brand-soft #EAF6EE
       danger #A34A3D (실패·거부·삭제)
폰트   Pretendard(한글) + Inter(숫자·영문)
크기   11 12 13 14 15 · 강조 20 22 24 28 — rem으로 쓰고 루트에서 일괄 조절
굵기   Regular · Medium · SemiBold · Bold
폭     본문 1440 · 패널 730 · 모달 465
radius 6 · 8 · 10 · 12 · 14 · 999
```

## 백엔드 현황

`/api/subscribe`는 정기구독이 아니라 **투자 청약**이다. `lib/subscription.ts`의 `executeSubscription`이 본인인증·연간한도·재고 검증 후 `TokenHolding`을 만든다.

| 영역 | 있는 것 | 없는 것 |
|---|---|---|
| 인증 | `auth/*`, `identity/*`(OpenDID 실연동), 본인 명의 계좌 확인 | 동의 문서 버전·전자서명 저장 |
| 투자 | `projects`, `investments/*`(적합성·동의·가상계좌 납입), 은행 입금 웹훅, `portfolio`, `payouts` | 수탁 지갑·보유 구좌 발행, 체인 잡 큐·대사 |
| 마일스톤 | `evidence`·`approve`·`verify`(AI 4종)·`complete`·`timeout`·`appeals` | 검증 근거 조회, 관리자 심사 큐, `manual_review` 경로 |
| 운영자 | `operator-applications`(방문·교육·계약이 이 PATCH 하나에 얹혀 있다) | 단계별 도메인 분리, 보증서 모델·발급·검증 |
| 정기구독(구매자) | `Subscription`·`PickupOrder` 모델, `subscriptions/*`, `catalog` | 픽업 바코드 발급, 건너뛰기·일시정지 |
| 운영 데이터 | `monitoring`, `optimization`, `briefing`, `iot/generate`, `sales`, `inventory` | 레시피 적용, NAV 조회, 매출·비용 확정 |
| 관리자 | `admin/*`, `audit-logs`, `appeals`, `reports/institution` | 체인 잡·대사 콘솔, 매출·비용 확정 게이트 |

v2.1에서 정리 대상인 모델: `Escrow`(→신탁), `TokenHolding`(→보유 구좌), `Dividend`(→회수금).

## 웹 화면 62개 · 우선순위

Figma "MVP 우선순위" 페이지의 분류를 따른다.

| 티어 | 개수 | 화면 |
|---|---|---|
| P0 코어 | 40 | C-01~04, C-I01·I02·I02E·I03·I05, I-01·02·03·03E·04·06·07·08, B-01~07·09, O-01~09, A-01~04·06·07 |
| P0 승격 | 2 | O-11(증빙 제출), A-08(증빙 재검토) |
| 예외·모달 | 3 | I-02E, B-04M, B-00E |
| Phase 2 | 17 | I-05·09·10, B-08, O-10·11E·12·13, A-05·09~16 |

`DEPRECATED · 지갑 주소 등록`과 `DEPRECATED · 지갑 재연결`은 Figma에 남아있지만 만들지 않는다(H2에서 리다이렉트 처리).

---

## Phase A · 기반

- [x] **A1** Figma 추출 도구 저장소 고정
  `design/farmfi-web.fig` 원본 · `tools/figma/kiwi.py`(kiwi 디코더) · `tools/figma/extract.py`(화면 트리 생성) · 결과물 `design/screens/`도 커밋
  검증: `python tools/figma/extract.py` → 웹 129개 재생성
- [x] **A2** 웹 디자인 토큰 + 라우트 매핑표
  `frontend/tailwind.config.ts`에 색·폰트·radius 등록 · `layout.tsx`에 Inter 추가 · `docs/figma-route-map.md`에 62행 매핑표 + 금지 용어 치환표 + 등급색 치환표
- [x] **A3** 웹 공용 UI 컴포넌트 11종
  `frontend/src/components/ui/` — `Button` `Card` `Badge` `ProgressBar` `StatRow` `DataTable` `Field` `Modal` `StepLine` `EmptyState` `AppHeader`

## Phase B · 공통·인증 (신규 API 없음)

- [x] **B1** C-01 서비스 홈 → `/`
- [x] **B2** C-02 로그인 · C-03 회원가입 → `/login` `/signup` (`auth/*` 재사용)
- [x] **B3** C-04 이용 목적 선택 → `/start` (투자자·구매자·운영자 3분기)
- [x] **B4** 투자자 본인확인 5개 — C-I01 방법 선택 · C-I02 모바일 신분증 확인 · C-I02E 확인 실패 · C-I03 본인 명의 계좌 확인 · C-I05 완료
  → `/verify/*`. 기존 `identity/*` API와 `components/farmfi/identity/api.ts` 재사용
  C-I03의 레이어 이름에 옛 지갑 잔재(`공식 앱 안내`·`설치 순서`·`스토어 버튼`)가 남아있다. 표시 텍스트는 계좌 확인이 맞으므로 이름만 계좌 기준으로 옮긴다

## Phase C · 투자자

- [x] **C1** I-01 프로젝트 상세 → `/projects/[id]` · I-06 투자자 홈 → `/investor`
  기존 `projects`, `projects/[id]` API 재사용. 금지 용어 치환 적용
- [x] **C2** `Investment` 모델 + 신청 상태 API
  상태: `DRAFT → IDENTITY_REQUIRED → ELIGIBILITY_CHECKED → CONSENT_REQUIRED → AWAITING_DEPOSIT → DEPOSIT_CONFIRMED → CHAIN_PENDING → COMPLETED` (+ `CHAIN_FAILED`)
- [x] **C3** I-02 적합성 확인 · I-03 최종확인·전자서명·납입 · I-04 신청 완료
  → `/projects/[id]/invest/{eligibility,confirm,done}`
- [x] **C4** I-02E 부적격 안내 · I-03E 납입 실패 (모달·상태 분기)
- [x] **C5** I-07 보유 투자 → `/investor/holdings` · I-08 회수 상세 → `/investor/payouts/[id]`
  `TokenHolding`을 `투자 금액 / 보유 구좌 / 계약 상태`로 표기. 원장 원문(주소·txHash·토큰수량) 응답 제외

## Phase D · 마일스톤 증빙 게이트 (P0 핵심)

조건부 집행의 핵심. 증빙이 `APPROVED`가 아니면 집행 API가 거부한다.

- [x] **D1** `Milestone` 상태 흐름 확장 + 증빙 API
  `SCHEDULED → EVIDENCE_SUBMITTED → REVIEWING → APPROVED → EXECUTION_REQUESTED → PAID` (+ `REVISION_REQUIRED`)
  `POST /api/milestones/[id]/evidence`(운영자 제출) · `POST /api/milestones/[id]/approve`(관리자 승인)
  기존 `verify`(AI 검증 4종)를 `REVIEWING` 단계에 연결
- [x] **D2** O-11 증빙 제출 → `/operator/milestones/[id]/evidence`
- [x] **D3** A-08 증빙 재검토 → `/admin/evidence`

## Phase E · 운영자

- [x] **E1** O-01 공간 탐색 · O-02 공간 상세 → `/operator/spaces`, `/operator/spaces/[id]` (`spaces` API 재사용)
- [x] **E2** O-03 자격·서류 신청 → `/operator/apply` (`operator-applications` 재사용)
- [x] **E3** O-04 방문 예약 · O-05 필수 교육 → `/operator/apply/{visit,education}` (**API 신규**)
- [x] **E4** O-06 공간 최종 확정 · O-07 계약 전자서명 → `/operator/apply/{confirm,contract}` (**API 신규**)
- [x] **E5** O-08 보증서 발급 · O-09 개점 준비 현황 → `/operator/certificate`, `/operator`

## Phase F · 구매자 (백엔드 신규가 가장 큼)

- [x] **F1** `Subscription` 모델 + 정기구독 API
  픽업 지점 · 팩 크기 · 수령 주기 · 회차. `Product`/`Inventory` 연결
- [x] **F2** B-01 픽업 지점 · B-02 팩 크기·주기 · B-03 재고 기반 구성 → `/subscribe/*`
- [x] **F3** 결제 API + B-04 주문서 · B-05 결제수단·자동결제 · B-06 신청 완료
- [x] **F4** B-07 내 구독 현황 → `/subscriptions` · B-09 픽업 바코드 → `/subscriptions/pickup/[id]`
- [x] **F5** B-04M 쿠폰 모달 · B-00E 구독 없음 빈 상태

## Phase G · 관리자

- [x] **G1** A-01 콘솔 홈 → `/admin`
- [x] **G2** A-02 운영자 심사·가배정 · A-03 보증서 발급 관리 → `/admin/operators`, `/admin/certificates`
- [x] **G3** A-04 공간·설비 구성 → `/admin/spaces`
- [x] **G4** A-06 투자 프로젝트 관리 · A-07 마일스톤 설정 → `/admin/projects`, `/admin/projects/[id]/milestones`

## Phase H · v2.1 용어·모델 정리

- [x] **H1** 화면·API·로그에서 금지 용어 제거
  `Escrow` → 신탁(custody) · `TokenHolding` → 보유 구좌 · `Dividend` → 회수금
  검증: `grep -rE '토큰|지갑|에스크로|배당|락업|증권|STO' frontend/src` → 0건
- [x] **H2** `DEPRECATED · 지갑 주소 등록` / `지갑 재연결` 라우팅 제외, 기존 URL은 리다이렉트

## Phase I · Phase 2 화면 17개

- [x] **I1** 투자자 I-05 신청·취소 내역 · I-09 알림함 · I-10 알림 설정
- [x] **I2** 구매자 B-08 구성·일정 변경
- [x] **I3** 운영자 O-10 검증 현황 · O-11E 이의제기 · O-12 집행 완료 · O-13 정산·지급 내역
- [x] **I4** 관리자 A-05 구독·픽업 예외 · A-09 외부 전문가 판정 · A-10 정산 규칙 · A-11 정산 결과
- [x] **I5** 관리자 A-12 감사 로그 · A-13 권한 관리 · A-14 알림 발송 · A-15 AML·이상거래 · A-16 매출·비용 입력

## Phase J · 기존 6개 재디자인

Figma에 원본이 없으므로 A2 토큰과 A3 컴포넌트로 새로 그린다.

- [x] **J1** `/monitoring/[projectId]` · `/optimization/[projectId]` (AI 검증 핵심 화면)
- [x] **J2** `/landlord` · `/about` · `/admin/demo` · `/verify-identity`

## Phase K · 웹 정리

- [x] **K1** `globals.css` 미사용 클래스 제거
- [x] **K2** `components/farmfi/**` 중 화면 전용 파일 삭제 (데이터 층 `api.ts`는 유지)

## Phase N · 디자인 최종본 반영

최종 `.fig`를 받은 뒤에 한다. 이 Phase가 끝나야 화면이 최종 디자인과 같다고 말할 수 있다.

- [ ] **N1** 최종 `.fig` 교체 + 덤프 재생성
  `design/farmfi-web.fig`를 교체하고 `python tools/figma/extract.py` 재실행. `design/screens/`의 diff로 바뀐 범위를 먼저 확인한다
- [ ] **N2** 화면 목록 대조
  잠정본 62개 대비 추가·삭제·ID 변경을 정리하고 이 문서의 화면 표와 `figma-route-map.md`를 갱신. 없어진 화면은 라우트까지 정리한다
- [ ] **N3** 생김새 대조
  남은 화면을 덤프와 코드로 다시 대조(좌표·색·폰트·radius). 팔레트 밖 색이 새로 들어왔으면 `figma-color-map.md`에 반영
- [ ] **N4** 문구 재확인
  최종본 텍스트로 화면 문구를 맞추고 금지 용어 grep을 다시 0건으로
- [ ] **N5** 검증 재실행
  `npx tsc --noEmit` + 렌더 대조 + Vercel 프리뷰

---

# 잔여 기능 · 기능명세서 기준

Phase A~K는 화면과 그 화면이 도는 데 필요한 최소 API를 만들었다. 여기서부터는 명세서에 있는데 코드에 없는 기능이다. 순서는 `feature-spec.md` 16장(P0 → P1 → P2)을 따른다.

외부 사업자가 정해지지 않은 것은 전부 어댑터 뒤에 Mock으로 만든다(명세 17.2). 도메인 서비스와 화면은 어댑터 구현체가 바뀌어도 그대로여야 한다.

## Phase O · 투자금 납입 실계

명세 5.2·3.4의 가상계좌 경로로 납입한다. 동의를 마치면 건별 가상계좌를 발급하고, 은행 입금이 확인돼야 청약이 반영된다.

- [x] **O1** `InvestmentPaymentAdapter` + Mock
  가상계좌 발급·입금 조회·웹훅 서명 검증을 인터페이스 뒤로. 도메인 코드는 어댑터만 호출한다
- [x] **O2** 본인 명의 계좌 확인
  `POST /api/bank-accounts/verify-holder` · `GET·PATCH /api/me/bank-account`. 계좌번호 원문 대신 토큰과 마스킹값을 저장한다
- [x] **O3** 가상계좌 발급·입금 상태
  `POST /api/investments/[id]/virtual-account` · `GET .../deposit-status`. `AWAITING_DEPOSIT` + 입금기한
- [x] **O4** 은행 입금 웹훅
  `POST /api/webhooks/bank/deposits`. 제공사 서명 검증, `providerTransactionId` unique로 중복 웹훅 1회 처리, 금액 불일치는 `AMOUNT_MISMATCH`로 관리자 큐
- [x] **O5** I-03E 네 분기
  발급 실패 · 입금기한 만료 · 금액 불일치 · 확인 지연(`POST .../deposit-inquiry`)을 화면에서 구분

## Phase P · 체인 기록·보유 구좌 발행

명세 10.4의 순서를 그대로 구현한다. `lib/onchain.ts`는 지금 마일스톤 검증·집행만 호출한다.

- [x] **P1** 투자자 수탁 지갑 — `lib/custody.ts`
  1인 1지갑(`CustodyWallet.userId` unique)을 서버가 생성. 개인키는 AES-256-GCM으로 봉해 `keyRef`만 DB에 둔다. 마스터 키(`CUSTODY_MASTER_KEY`)가 없으면 지갑을 만들지 않는다 — 평문 저장으로 물러서지 않는다. 주소는 admin 응답에만 싣고 투자자 화면에는 내보내지 않는다
- [x] **P2** Chain Relay + Outbox — `lib/chain-relay.ts`
  `HoldingIssuance` 행이 곧 아웃박스다. 입금 확인과 **같은 트랜잭션**에서 PENDING으로 생기고(`eventId = deposit:<거래번호>:mint`, unique), 체인 전송은 그 뒤에 따라붙는다. 웹훅이 몇 번 와도 발행 행은 하나다
- [x] **P3** 실패 처리
  지수 백오프(30초부터 5회) 후 `CHAIN_FAILED` + 운영 알림. 체인이 실패해도 입금·청약은 되돌리지 않는다. 청약이 `DEPOSIT_FAILED`로 끝난 건은 발행을 `CANCELLED`로 닫는다 — 환불 대상에 구좌를 발행하지 않는다
- [x] **P4** 발행 콘솔 — `GET/POST /api/admin/issuances`
  계획의 `chain-jobs` 대신 `issuances`로 냈다. 잡 큐가 따로 없고 발행 행이 곧 큐라 이름을 실체에 맞췄다. POST에 `id`를 주면 그 건만 재시도(`CHAIN_FAILED`도 되살린다), 안 주면 전체 드레인
- [ ] **P5** 대사
  10분 주기로 `PENDING`·`SENT` 영수증 재조회, 하루 한 번 DB↔체인 건수 대조. 불일치는 자동 수정하지 않고 감사 큐로(`GET /api/admin/reconciliation`)

**컨트랙트 매핑 (P2 결정)** — 명세의 `HoldingLedger`를 새로 배포하지 않고 이미 배포된 `FarmToken`이 그 역할을 한다. `mintHolding` → `FarmToken.mint(address,uint256)`. 근거: `decimals() == 0`이라 1구좌 = 정수 1로 그대로 맞고, `_update`의 화이트리스트 게이트가 `from == address(0)`(발행)을 예외로 두어 신원 등록 전에도 발행이 된다. 2차 이전(`transferHolding`)은 송·수신 지갑 모두 `registerIdentity`가 필요하므로 그때 별도 단위로 뺀다.

## Phase Q · 계약 동의·운영자 보증서

- [ ] **Q1** 동의 문서
  `GET /api/agreements/[id]` · `POST .../consent`. 문서 버전·동의 시각·전자서명값을 저장하고 문서 해시를 체인 기록 대상으로 넘긴다
- [ ] **Q2** 신청 단계 도메인 분리
  방문 예약·교육 이수·계약 서명이 `OperatorApplication` PATCH 하나에 얹혀 있다. `POST /api/operator/visits` · `/courses/[id]/progress` · `/contracts/[id]/signature-request`로 나누고 자동저장·이전 단계 이동을 살린다
- [ ] **Q3** 보증서 모델
  발급·정지·만료. 지점 운영계약 기간과 연동하고 교육·안전점검 만료 또는 중대 위반 시 정지(명세 17.1-8). `GET /api/operator/credential` · `POST /api/admin/operator-credentials` · `PATCH .../status`
  앱이 이 보증서를 검증해 운영 기능을 열고 닫는다. 모델과 상태값이 정본이므로 앱 담당과 필드를 맞춰 둔다

## Phase R · 픽업 바코드

B-09가 지금 `patchSubscription`으로 대신하고 있다. `PickupOrder` 모델은 이미 있다.

- [ ] **R1** 바코드 발급·조회
  `GET /api/pickups/[id]/barcode`. 같은 회차는 같은 바코드를 돌려주고, 이미 수령한 회차는 발급하지 않는다
  스캔·수령 완료 처리는 앱 담당이다. 발급 쪽에서 재사용을 막아 두면 스캔 쪽 중복 처리 방지와 짝이 맞는다

## Phase S · 정산 입력과 지급

- [ ] **S1** 매출·비용 입력·확정
  `PUT /api/admin/projects/[id]/records` · `POST .../records/confirm`(사유 필수). 확정 전 값은 정산 계산에 들어가지 않는다
- [ ] **S2** 지급 실패 처리
  실패 사유별 재시도와 회수 계좌 수정 경로(I-08)
- [ ] **S3** NAV 조회
  `GET /api/projects/[id]/nav`. `lib/nav-calculator.ts`가 지금 `portfolio`에서만 쓰인다. 청약·집행 0건이면 표시하지 않는다

## Phase T · 검증 근거와 심사 큐

- [ ] **T1** 검증 근거 조회
  `GET /api/milestones/[id]/verification`. 신호별 판정 초안·추출값·교차대조 결과·신뢰도
- [ ] **T2** 관리자 심사 큐
  `GET /api/admin/milestones/review-queue` · `POST .../review`(조건 항목별 판정 배열과 사유 필수)
- [ ] **T3** `manual_review`
  센서 결측·설비 무응답·자동 검증 실패는 자동 반려가 아니라 큐로 보낸다

## Phase W · 운영 고도화

- [ ] **W1** 생육 레시피
  `GET /api/spaces/[id]/recipe` · `POST .../recipe/apply`. `lib/growth-recipe.ts`가 아직 어디에도 붙어 있지 않다. 관측 3사이클 미만이면 작물 프로파일 값을 쓰고, 적용은 운영자가 누를 때만 한다
- [ ] **W2** 최적화 적용
  `POST /api/spaces/[id]/optimization/apply`. 산출값과 실제 적용값을 함께 기록하고, 정산·판정에는 적용값을 쓴다
- [ ] **W3** 기관 성과 리포트 화면
  API(`reports/institution`)는 있고 화면이 없다. CSV 내보내기 포함
- [ ] **W4** 구독 상세 변경
  건너뛰기·일시정지·해지. 다음 결제일 전날까지 해지, 픽업 3시간 전까지 변경(명세 17.1-9)

## 명세와 화면 목록이 어긋나는 곳

화면 ID는 Figma와 명세가 서로 다른 것을 가리킨다. 기능을 붙일 때 ID가 아니라 이름으로 찾는다.

| 명세 | Figma | 영향 |
|---|---|---|
| O-12 매장 운영 현황(조회) | O-12 마일스톤 집행 완료 | 웹에 운영 현황 화면이 없다. 앱 대시보드와 범위가 겹쳐 어디에 둘지 결정이 필요하다 |
| O-13 생육 레시피·환경 최적화 | O-13 정산·지급 내역 | W1·W2가 붙을 화면이 없다 |
| A-10 매출·비용 입력 | A-16 매출·비용 입력 (`/admin/ledger`) | S1은 A-16에 붙인다 |
| A-11 기관 성과 리포트 | A-11 정산 결과 | W3이 붙을 화면이 없다 |

화면이 없는 기능은 최종 `.fig`(Phase N)에 있는지 먼저 확인한다. 최종본에도 없으면 A2 토큰과 A3 컴포넌트로 새로 그린다(Phase J와 같은 방식).

---

## 검증

- 타입: `cd frontend && npx tsc --noEmit`
- 렌더: `npm run dev` → 각 라우트를 열어 `design/screens/farmfi-web/전체/<ID>.txt`와 대조 (색 hex·폰트 크기·간격)
- 데이터: 화면 교체 전후로 같은 데이터가 나오는지
- 용어: 위 grep 0건
- 프로덕션 빌드: Vercel 프리뷰 배포 (로컬 `next build`는 한글 경로 EISDIR로 실패)

**잔여 기능 (Phase O~W)**
- 통과 기준은 `feature-spec.md` 18장의 역할별 인수 테스트를 쓴다 — 중복 은행 웹훅이 와도 투자금 1회 반영, 같은 `eventId`로 재시도해도 보유 구좌 이중 발행 없음, 승인되지 않은 마일스톤은 집행 API가 거부
- 어댑터는 Mock 구현체로 흐름 전체가 도는 것까지 확인한다

## 범위 밖

- 운영자 앱(`app/`)과 앱만 호출하는 API — 다른 담당. 스키마가 겹칠 때만 맞춘다
- `contracts/` 컨트랙트 코드 — 함수 매핑만 Phase P2에서 정하고, 수정이 필요하면 별도 단위로 뺀다
- 외부 사업자 실계약 — 은행·PG·신탁·모바일 신분증 실 API는 명세 17.3 게이트다. 전부 Mock 어댑터로 개발한다
- 투자 모집 기능의 실제 활성화 — 법률 검토와 금융 파트너 승인 전까지 feature flag로 비활성(명세 17.1-5)

## 금지 용어 잔존 범위

`frontend/src`에서 화면·API 응답·감사 로그 문구는 모두 치환했다. 아래 두 곳에는 옛 용어가 남는다.

- **Prisma 모델명** — `Escrow` · `TokenHolding` · `Dividend`. 이름을 바꾸려면 데이터 마이그레이션이 따라야 하므로 `docs/team-handoff-v2.1.md`의 모델 정리 작업으로 넘긴다.
- **내부 주석과 생성 코드** — 기존 API route의 설계 주석과 `src/generated/prisma/**`. 사용자에게 보이지 않는다.

검증 기준은 `grep -rnE '토큰|지갑|에스크로|배당|락업|증권|\bSTO\b' frontend/src --include="*.tsx"` → 0건이다.
