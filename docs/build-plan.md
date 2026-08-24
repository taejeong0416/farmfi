# 개발 계획 · 웹 화면 61개 + 기능

Figma 화면을 옮기면서, 그 화면이 실제로 도는 데 필요한 API·모델을 같이 만든다. 화면과 기능을 짝으로 완성해 어느 시점에 멈춰도 그 지점까지는 동작하는 데모가 되게 한다.

## 범위

이 문서는 웹(`frontend/`)만 다룬다 — 웹 화면 61개와 웹이 호출하는 API.

운영자 앱(`app/`)과 앱만 호출하는 API는 다른 담당이 맡는다. 앱 전용 경로(증빙 촬영 제출, 매장 컨텍스트·생육·재고 쓰기, 설비 연결·임계값·제어 명령, 픽업 바코드 스캔·수령 처리)는 `frontend/src/app/api`에 들어오더라도 여기서 계획하지 않는다. 앱과 웹이 같은 서버·같은 DB를 쓰므로 스키마가 겹치면 `prisma/schema.prisma`에서 만난다.

**`design/farmfi-web.fig`는 디자인 최종본이다.** Phase A~K는 그 앞 버전을 보고 그렸으므로, A~K의 체크는 "그 버전 기준으로 이식과 검증을 끝냈다"는 뜻이다. 최종본과 화면이 같다고 말할 수 있는 근거는 Phase N의 체크다.

추출한 화면 트리는 `design/screens/farmfi-web/<페이지>/<화면>.txt`에 있다. 한 줄이 노드 하나이고 절대좌표·크기·색·폰트가 그대로 적혀 있다. Figma가 갱신되면 `.fig`를 교체하고 `python tools/figma/extract.py`를 다시 돌린다. `design/screens/`의 diff가 무엇이 바뀌었는지 알려주는 1차 자료다.

## 이어서 하기

**다음 작업 = 아래에서 체크 안 된 첫 항목.**

작업 단위 하나를 끝낼 때마다:
1. `- [ ]`를 `- [x]`로 바꾸고
2. 검증(`npx tsc --noEmit` + `npm run dev` 육안)을 통과시킨 뒤
3. 그 단위만 커밋한다 (`feat:` / `fix:` / `docs:` 접두)
4. 판단이 갈렸던 지점은 `dev-log.md` 맨 위에 한 줄 남긴다

세션이 바뀌어도 이 파일의 체크 상태가 진행 상황의 정본이다.

## 원칙

디자인이 기준이다. Figma 화면 목록·생김새·색·문구를 그대로 옮긴다. 기능명세서는 Figma가 표현할 수 없는 것(API·상태·권한)에만 적용한다.

| 항목 | 결정 |
|---|---|
| 화면 목록 | 61개 |
| 생김새 | `.fig`가 기준 (좌표·색·폰트·radius) |
| 데이터 층 | 기존 `components/farmfi/**/api.ts` 재사용. 없는 것만 신규 |
| 스타일링 | Tailwind + `tailwind.config.ts` 토큰 |
| Figma에 없는 6개 | Phase J에서 Figma 톤으로 재디자인 |

### 명세가 디자인을 이기는 것

**O-11·A-08은 P0** — Figma는 비핵심 UI에 그렸지만 `team-handoff-v2.1.md` 2-D가 "위치와 무관하게 MVP"로 명시한다.

## 색

`.fig`에서 그대로 뽑은 값이다.

| 역할 | 값 | 어디에 |
|---|---|---|
| ink | `#1A1A1A` | 본문·제목 |
| body | `#4A4A4A` | 보조 본문 |
| muted | `#8A8A8A` | 라벨·비활성 |
| line | `#E5E5E3` | 테두리 |
| line-soft | `#EDEDEB` | 구분선 |
| surface | `#F1F4F2` | 안내 상자·사진 자리·선택된 항목 배경 |
| brand | `#14542E` | 버튼·링크·활성 탭·통과·강조 |
| danger | `#DC2626` | 원금 비보장 배지·이상거래·실패 |
| accent-investor | `#207349` | 투자자 포털 배지 |
| accent-operator | `#8C6114` | 운영자 포털 배지 |

제3자 브랜드 로고(B-05 결제수단)는 원본 색을 쓴다.

## 용어

화면 문구는 `.fig`를 그대로 쓴다.

## 데스크톱 먼저

반응형은 나중에 붙인다. 지금은 데스크톱(1440)만 확인한다.

구현은 절대좌표 대신 `max-width` + flex/grid + `rem`으로 짠다. 나중에 브레이크포인트만 추가하면 되고, 루트 폰트 크기 하나로 전체 크기를 조절할 수 있다. Figma 덤프의 좌표는 간격을 읽는 용도지 그대로 옮길 값이 아니다 — `@33,442`와 `@207,442`는 "왼쪽 여백 33, 두 버튼 사이 10"으로 읽는다.

## 디자인 토큰

`.fig`에서 추출한 실제 값에 그라운드 룰을 적용한 것.

```
색     ink #1A1A1A · body #4A4A4A · muted #8A8A8A
       line #E5E5E3 · line-soft #EDEDEB · surface #F1F4F2
       brand #14542E · danger #DC2626
       accent-investor #207349 · accent-operator #8C6114
폰트   Inter(기본) + Pretendard(한글 글리프 대체)
크기   11 12 13 14 15 16 · 강조 17 18 20 22 24 28 — rem으로 쓰고 루트에서 일괄 조절
굵기   Regular · Medium · SemiBold · Bold
폭     본문 1440 · 패널 730 · 모달 465
radius 4 · 6 · 8 · 10 · 12 · 14 · 999
```

## 백엔드 현황

`/api/subscribe`는 정기구독이 아니라 **투자 청약**이다. `lib/subscription.ts`의 `executeSubscription`이 본인인증·연간한도·재고 검증 후 `TokenHolding`을 만든다.

| 영역 | 있는 것 | 없는 것 |
|---|---|---|
| 인증 | `auth/*`, `identity/*`(OpenDID 실연동), 본인 명의 계좌 확인, 동의 문서 버전·전자서명 저장 | 계약 해시 체인 기록 |
| 투자 | `projects`, `investments/*`(적합성·동의·가상계좌 납입), 은행 입금 웹훅, `portfolio`, `payouts` | 수탁 지갑·보유 구좌 발행, 체인 잡 큐·대사 |
| 마일스톤 | `evidence`·`approve`·`verify`(AI 4종)·`complete`·`timeout`·`appeals` | 검증 근거 조회, 관리자 심사 큐, `manual_review` 경로 |
| 운영자 | `operator-applications`(서류·확정), `operator/visits`·`courses`·`contracts`, 보증서 발급·정지·만료 | 앱의 보증서 검증(`credential/verify` — 앱 담당) |
| 정기구독(구매자) | `Subscription`·`PickupOrder` 모델, `subscriptions/*`, `catalog`, 픽업 바코드 발급 | 건너뛰기·일시정지 |
| 운영 데이터 | `monitoring`, `optimization`, `briefing`, `iot/generate`, `sales`, `inventory` | 레시피 적용, NAV 조회, 매출·비용 확정 |
| 관리자 | `admin/*`, `audit-logs`, `appeals`, `reports/institution` | 체인 잡·대사 콘솔, 매출·비용 확정 게이트 |

v2.1에서 정리 대상인 모델: `Escrow`(→신탁), `TokenHolding`(→보유 구좌), `Dividend`(→회수금).

## 웹 화면 61개 · 우선순위

Figma의 핵심 UI / 비핵심 UI 분류를 따른다.

| 티어 | 개수 | 화면 |
|---|---|---|
| P0 코어 | 40 | C-01~04, C-I01·I02·I02E·I03·I05, I-01·02·03·03E·04·06·07·08, B-01~07·09, O-01~09, A-01~04·06·07 |
| P0 승격 | 2 | O-11(증빙 제출), A-08(증빙 재검토) |
| 예외·모달 | 3 | I-02E, B-04M, B-00E |
| Phase 2 | 16 | I-05·09·10, B-08, O-10·11E·12·13, A-09~16 |

`A-05 구독·픽업 예외 관리`는 최종본에 도면이 없다. 라우트·API는 살려 두고 콘솔 사이드바에서만 뺀다(`figma-route-map.md`).

---

## Phase A · 기반

- [x] **A1** Figma 추출 도구 저장소 고정
  `design/farmfi-web.fig` 원본 · `tools/figma/kiwi.py`(kiwi 디코더) · `tools/figma/extract.py`(화면 트리 생성) · 결과물 `design/screens/`도 커밋
  검증: `python tools/figma/extract.py` → 웹 129개 재생성
- [x] **A2** 웹 디자인 토큰 + 라우트 매핑표
  `frontend/tailwind.config.ts`에 색·폰트·radius 등록 · `layout.tsx`에 Inter 추가 · `docs/figma-route-map.md`에 화면·라우트 매핑표
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

이 Phase가 끝나야 화면이 최종 디자인과 같다고 말할 수 있다.

- [x] **N1** 최종 `.fig` 교체 + 덤프 재생성
  `design/farmfi-web.fig` 교체 후 `python tools/figma/extract.py web` 재실행. 페이지가 `_핵심_UI` · `관리자_콘솔` · `비핵심_UI_관리자_콘솔_제외_` 셋으로 재편됐다
- [x] **N2** 화면 목록 대조
  61개. 빠진 것은 `A-05`와 `DEPRECATED` 2개, 새로 생긴 ID는 없다. 화면 표와 `figma-route-map.md` 갱신
- [x] **N3a** 전역 폰트를 Inter로
  최종본 텍스트 3,416개가 Inter다. `globals.css` 전역 지정을 바꾼다
- [x] **N3b** 역할별 내비게이션 셸
  최종본은 화면마다 역할 내비를 고정으로 붙인다 — 공용 / 투자자 포털 / 운영자 포털 / 구매자 / 관리자 콘솔 사이드바. 바뀐 화면 diff의 대부분이 이것
- [x] **N3c** 전면 재설계된 화면
  문구 일치율 70% 미만: `I-02`(8%) `B-05`(34%) `O-11E`(35%) `A-03`(40%) `O-04`(43%) `C-I01`(47%) `B-00E`(50%) `C-04`(62%) `O-05`(62%)
- [x] **N3d** 나머지 화면 국소 대조
  내비를 반영하고 남는 실제 차이만 고친다. `C-01` 히어로·KPI·프로젝트 카드가 대표적
- [x] **N4** 색·문구 재확인
  `.fig`의 색을 그대로 토큰에 넣고 화면 문구를 `.fig`와 맞춘다
- [x] **N5** 검증 재실행
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
- [x] **P5** 대사 — `lib/reconciliation.ts`
  Vercel Cron이 `/api/cron/reconcile`을 부른다(`CRON_SECRET` 없으면 503으로 닫힘 — 열어 두면 아무나 가스를 태우는 버튼이 된다). Vercel Hobby는 하루 1회 크론만 허용해 둘 다 하루 한 번이다(영수증 03:00, 전체 대사 03:20). 되돌려진 트랜잭션을 최대 하루 늦게 잡는다는 뜻이므로, 그 사이가 문제가 되면 Pro로 올리거나 `/api/cron/reconcile`을 직접 호출한다. `sweepReceipts()`가 해시만 남고 확정되지 않은 건의 영수증을 다시 읽는다. Relay는 "해시가 있으면 성공"으로 넘기지만 여기서는 영수증을 실제로 확인해 되돌려진 트랜잭션을 잡는다 — revert면 해시를 지워 Relay가 성공으로 오인하지 못하게 한다. `reconcileHoldings()`는 지갑별 확정 구좌 합과 `balanceOf`를 비교한다. **불일치는 고치지 않는다** — 어느 쪽이 정본인지 모르는 상태에서 한쪽에 맞추면 틀린 쪽을 정본으로 만든다. `ReconciliationEntry`(OPEN·RESOLVED)에 적고 알림을 남긴다. 조회·해소는 `GET/POST /api/admin/reconciliation`(해소 사유 필수)

**컨트랙트 매핑 (P2 결정)** — 명세의 `HoldingLedger`를 새로 배포하지 않고 이미 배포된 `FarmToken`이 그 역할을 한다. `mintHolding` → `FarmToken.mint(address,uint256)`. 근거: `decimals() == 0`이라 1구좌 = 정수 1로 그대로 맞고, `_update`의 화이트리스트 게이트가 `from == address(0)`(발행)을 예외로 두어 신원 등록 전에도 발행이 된다. 2차 이전(`transferHolding`)은 송·수신 지갑 모두 `registerIdentity`가 필요하므로 그때 별도 단위로 뺀다.

## Phase Q · 계약 동의·운영자 보증서

- [x] **Q1** 동의 문서 — `lib/agreements.ts`
  문서는 고쳐 쓰지 않고 `version`을 올린다(`Agreement`). 동의 기록(`AgreementConsent`)에는 문서 해시를 복사해 둬 문서 행이 바뀌어도 동의 시점의 본문이 무엇이었는지 남는다. `GET /api/agreements`(목록) · `GET /api/agreements/[id]`(본문, 행 id 또는 코드) · `POST .../consent`(동의 시각·전자서명값·본인확인 세션 저장). 필수 문서를 다 동의해야 `POST /api/investments/[id]/consent`가 통과하고, 그때 동의 문서들을 묶은 해시를 `Investment.agreementHash`에 남긴다 — 체인에 올릴 계약 해시다. I-03은 이 문서 목록을 그대로 그리고 전문을 모달로 읽는다
  체인 전송은 남아있다. 명세 10.6의 `registerAgreement`에 해당하는 함수가 배포된 컨트랙트에 없다 — 컨트랙트 수정은 별도 단위다
- [x] **Q2** 신청 단계 도메인 분리 — `lib/operator-apply.ts`
  방문은 `OperatorVisit`이 상태를 가진다 — 살아 있는 예약은 하나이고, 다시 예약하면 그 건이 옮겨간다. `POST /api/operator/visits` · `PATCH .../[id]`(변경·취소). 교육은 `OperatorCourse`(기준 데이터) + `OperatorCourseProgress`(과정별 진도·중단 지점)로 나눴다. `POST /api/operator/courses/[id]/progress`는 진도를 뒤로 물리지 않고 중단 지점만 덮어써 이어보기가 된다. 신청 행의 `educationProgress`는 비중을 반영한 파생값이다. 계약은 `OperatorContract`가 본문과 해시를 들고, `POST /api/operator/contracts/[id]/signature-request`를 두 번 부른다 — 서명값 없이 부르면 요청, 서명값과 함께 부르면 서명. 요청 없이 서명값만 보내면 받지 않는다
  `PATCH /api/operator-applications/[id]`에는 서류·공간 확정만 남았다. 진행 표시줄에서 끝낸 단계를 눌러 돌아갈 수 있다. 방문 예약을 취소해도 신청 상태를 뒤로 밀지 않는다 — 이미 끝난 교육·계약이 없던 일이 되면 안 된다
- [x] **Q3** 보증서 모델 — `lib/credential.ts` · `GET /api/operator/credential` · `GET|POST /api/admin/operator-credentials` · `PATCH .../[id]/status`
  테이블은 이미 DB에 있었다(스키마에는 없이). `applicationId`로 어느 신청에서 나온 보증서인지 추적하는 구조라 O-08 흐름에 맞아 그대로 쓰고 `projectId`(앱이 연결할 매장)와 `vcId`만 더했다.
  **유효성 판정을 서버가 한다.** 앱이 `status` 문자열을 보고 스스로 판단하면 만료 계산이 두 벌이 되고 언젠가 갈린다. 만료는 저장된 status와 무관하게 시간이 정한다 — 배치가 늦게 돌아도 만료된 권한이 새지 않는다.
  정지·만료·해지를 갈라 둔다. 하나로 합치면 "왜 막혔나"에 답할 수 없다. 실패마다 **다음 행동**을 함께 준다(정지 → 사유 해소 후 재개 요청 / 만료 → 계약 갱신 후 재발급).
  정지·해지에는 사유가 필수다. 만료는 사람이 찍지 못한다(기간이 정한다). 유효한 보증서가 있으면 중복 발급을 409로 막는다. 해지는 되돌릴 수 없다.
  VC가 아직 없으면 `verifiedBy: "number"`로 내려준다 — 없는 VC를 있는 척하지 않는다.

## Phase R · 픽업 바코드

- [x] **R1** 바코드 발급·조회·수령 처리
  `GET /api/pickups/[code]/barcode`(구매자 발급). 회차를 가리키는 키는 확인번호 하나다 — 발급·조회·수령·준비가 같은 값을 쓴다. 확인번호(`code`)와 바코드 값(`barcodeToken`)은 다른 것이다 — 확인번호는 구독 id와 날짜로 정해져 짐작할 수 있으므로 스캔으로 수령 처리가 되는 값은 따로 만든다. 같은 회차는 몇 번을 열어도 같은 토큰이 나오고(화면을 저장해 뒀다가 매장에서 보여주는 흐름이라), 수령한 회차는 `409 PICKUP_BARCODE_USED`, 건너뛴 회차는 `400 PICKUP_SKIPPED`로 발급을 거부한다
  `GET /api/pickups?projectId=&date=` (오늘 예정 + 준비 요약) · `GET /api/pickups/[code]` (확인번호 조회) · `POST /api/pickups/[code]/complete` (수령) · `POST /api/pickups/[code]/prepare` (팩 준비 체크).
  `PickupOrder.code`에 unique를 걸었다 — 스캔도 수동입력도 이 값 하나로 찾으므로 중복이 있으면 어느 픽업인지가 결정되지 않는다. 그 대가로 확인번호 생성이 충돌할 수 있어 `createPickupOrders`가 후보를 밀며 재시도한다(`createMany`는 4건 중 하나만 부딪혀도 구독 생성이 통째로 깨진다).
  중복 처리는 조건부 `updateMany`로 막는다. 사전 조회로 막으면 동시 스캔 둘이 다 통과한다. 이미 처리된 건은 409에 처리 시각과 처리자를 실어 보낸다.
  명세의 네 분기를 `verdict`로 내려준다 — `OK` · `ALREADY_USED` · `OTHER_STORE` · `NOT_TODAY`(+ `SKIPPED`). 다른 지점 건은 구매자·구성을 아예 응답에 싣지 않는다.
- [x] **R2** B-09 바코드 이미지 저장
  캔버스로 그려 PNG로 내린다. 막대만 저장하면 스캔 실패 시 번호를 부를 수가 없어 확인번호·지점·일시를 이미지 안에 함께 그린다.
- [x] **R3** 배정 매장 게이트 — `lib/operator-scope.ts` · 운영 라우트 전체
  인수 기준 "배정되지 않은 매장의 데이터는 어떤 화면에서도 보이지 않는다".
  픽업에 걸고 나머지를 점검하다가 **인증이 아예 없는 라우트 6개**를 찾았다 —
  `sales/trend` · `monitoring/[projectId]` · `tasks/today` · `notifications` ·
  `devices` · `schedules`. 프로덕션에서 토큰 없이 `projectId`만 주면 센서 시계열
  14KB가 그대로 나왔다. `sales`·`inventory`·`products`는 역할 검사는 있었지만
  소유 검사가 없어 아무 운영자나 남의 매장을 열 수 있었다.
  `operatorGate(request)` 하나로 역할·소유를 함께 보게 하고 전부에 걸었다.
  라우트마다 두 줄씩 다시 쓰면 한 군데는 빠진다 — 실제로 빠져 있었다.
  `route-auth.test.ts`가 소스를 읽어 검사한다: 매장 라우트는 세션 검사와 소유
  검사가 **둘 다** 있어야 하고, `projectId`를 새로 받는 라우트가 목록에 없으면
  이름을 찍어 실패한다. 예외(구매 전 공개 카탈로그 등)는 이유와 함께 적어야 통과한다.

## Phase S · 정산 입력과 지급

- [x] **S1** 매출·비용 입력·확정 — `PeriodRecord` · `GET|PUT /api/admin/projects/[id]/records` · `POST .../records/confirm`
  A-16 화면이 비용을 로컬 state로만 들고 있어 새로고침하면 사라졌고, 정산은 요청 본문의 `totalRevenue`를 그대로 썼다 — 부르는 쪽이 배당 재원을 정하는 구조였다. 이제 배당 라우트는 `confirmed`인 기간 기록에서만 매출을 읽는다. 확정에는 사유가 필수다(숫자만 남으면 왜 그 값인지 사라진다). 확정된 기간은 잠그고, 해제는 별도 행위로 두되 이미 분배된 기간은 해제할 수 없다. 같은 기간 이중 분배는 409로 막는다. 데모 7단계도 저장→확정→분배 순서를 그대로 밟는다
  지급 원장(`buildPayoutPlan`)도 같은 규칙을 쓴다 — 확정된 기간 기록의 매출을 읽고, 없거나 draft면 판매 기록 합계로 간다. 운영 비용은 운영자 정산 줄에서만 빠진다. 투자자 회수금은 수수료 풀에서 나오므로 비용과 무관하다(v18 설계 원칙 2). 임대료는 비용 항목이 아니다 — 파트너 계약의 월 고정 임대료가 원장에서 따로 빠져 두 번 차감된다
- [x] **S2** 지급 실패 처리 — `lib/payout-failure.ts`
  실패를 한 덩어리로 다루면 "다시 시도"가 늘 열려 있고, 계좌가 잘못된 건은 눌러도 같은 자리에서 또 실패한다. `Payout.failureCode`에 어댑터 코드를 남기고 코드별 다음 행동을 한 표에 모았다 — 은행 오류는 그대로 재시도, 계좌 문제는 수취인이 고쳐야, 수동 이체 대상은 사람이. 재시도 불가 코드에 `POST .../execute`를 걸면 `409 PAYOUT_RETRY_BLOCKED`로 막고, 화면은 버튼을 아예 열지 않는다. 코드가 없거나 모르는 코드(사람이 손으로 실패 처리한 건)는 재시도를 열지 않는다 — 원인을 모르는 채 돈을 다시 보내지 않는다
  `retryCount`·`lastAttemptAt`은 이체를 실제로 보낸 횟수다. `GET /api/payouts`가 실패 건에 다음 할 일을 실어 내리되, 수취인에게는 자기가 할 수 있는 안내만 보인다
  I-08은 수취인이 고칠 수 있는 실패에만 계좌 수정 경로를 연다 — 은행 일시 오류에 계좌를 고치라고 하면 멀쩡한 계좌를 건드린다. `/verify/account?next=`로 보내고 등록을 마치면 회수 상세로 되돌아온다(앱 내부 경로만 받는다)
- [x] **S3** NAV 조회 — `GET /api/projects/[id]/nav`
  `lib/nav-calculator.ts`가 `portfolio`에서만 쓰이고 있었다. 지점 단위로 열어 I-01에 붙였다. 로그인 뒤에만 연다 — 투자 판단에 쓰이는 값이다
  **청약도 집행도 0건이면 값을 내지 않는다.** 산식은 0을 돌려주지만 그 0은 "가치가 0"이 아니라 "아직 잴 것이 없다"는 뜻이고, 0원으로 찍히면 투자자가 손실로 읽는다. `available: false`와 사유·근거 건수를 같이 내려 화면이 항목 자체를 감춘다. 발행 구좌 수가 없는 지점도 같은 이유로 감춘다 — 1구좌당 값을 나눌 수 없다
  조회는 `NavSnapshot`을 남기지 않는다. 조회가 기록을 만들면 누가 열어봤는지에 따라 직전 대비 변동률의 기준선이 달라진다

## Phase T · 검증 근거와 심사 큐

- [x] **T1** 검증 근거 조회 — `GET /api/milestones/[id]/verification`
  자동 검증이 만든 **초안**과 관리자가 확정한 항목별 판정을 나란히 준다. 둘을 한 값으로 합치면 "자동 검증이 곧 승인"이 되어 조건부 집행의 근거가 사라진다. 투자자도 읽을 수 있고(명세 A-08 "투자자 열람"), 원본 파일 경로는 관리자와 그 지점 운영자에게만 준다 — 증빙에는 계약 상대방·금액이 담긴다. 증빙 지문(해시)은 누구나 볼 수 있다.
- [x] **T2** 관리자 심사 큐 — `GET /api/admin/milestones/review-queue` · `POST /api/milestones/[id]/approve`(항목 배열)
  **조건 항목별 판정 없이는 승인이 열리지 않는다.** 항목은 `requiredSignals`를 그대로 쓰고, 교차검증이 걸린 단계는 그것도 하나의 항목이다 — 영수증과 사진이 각각 통과해도 서로 안 맞으면 조건을 못 채운 것이다. `MilestoneReviewItem`이 항목·판정·근거 증빙·판정자·시각을 남기고, 감사 로그에도 항목 배열이 들어간다.
  네 가지로 막는다: 미판정 항목 있음 · 미충족 항목 있음(보완·반려로 보낸다) · 파일 필요 항목의 근거 미지정 · 증빙 미제출. IoT와 교차검증은 근거 파일을 요구하지 않는다(지정할 파일이 없다).
  큐는 제출이 오래된 순이다 — 자금이 묶여 있는 시간이 곧 운영자의 손해다.
- [x] **T3** `manual_review`
  자동 검증 2회 실패는 반려가 아니라 `manual_review`로 가고, 심사 큐에 같이 담긴다. 별도 화면으로 빼면 아무도 안 본다. 실패한 검증도 항목 초안을 남겨 관리자가 어느 항목이 왜 걸렸는지 보고 판정한다.
  자동 검증은 항목을 `met`으로 확정하지 않는다. 초안만 만들고 사람이 손댄 항목(`autoDraft: false`)은 덮어쓰지 않는다.

## Phase W · 운영 고도화

- [x] **W1** 생육 레시피 — `lib/applied-setpoints.ts` · `GET|POST /api/projects/[id]/setpoints`
  라우트 이름은 계획의 `/api/spaces/[id]/recipe` 대신 `projects/[id]/setpoints`로 냈다. 이 값이 붙는 대상이 공간이 아니라 운영 중인 프로젝트이고, W2의 봉투와 같은 자원을 다루므로 한 라우트로 합쳤다.
  **9.2 최적대 판정과 9.5 목표 DLI가 이제 학습값을 본다.** 적용된 설정점을 중심으로 최적대를 좁히고 목표 DLI를 그 값으로 바꾼다. 원칙은 봉투와 같다 — **좁힐 수만 있고 넓힐 수 없다.** 문헌 범위 밖으로는 절대 안 나가고, **고장 게이트는 건드리지 않는다**(물리 한계는 학습의 대상이 아니다).
  `APPLIED`가 아닌 요인은 쓰지 않는다. 규칙이 클램프하거나 거부한 값은 "규칙이 잘라낸 자리"지 이 매장의 최적이 아니다.
  확인: 적용 전 온도 최적대 `[18, 24]`·목표 DLI `15` → 적용 후 `[20.3, 23.3]`·`15.8`.
- [x] **W1a** 레시피 관측을 실데이터로 — `lib/growth-observations.ts`
  `HarvestRecord`(사이클의 끝과 수확량)와 `IotData`(그 기간 환경 시계열)를 조인해 관측을 만든다. 사이클 창은 `Product.growDays`로 수확 시점에서 거꾸로 잡는다. 사이클이 `MIN_MEASURED_CYCLES`(30)에 못 미치면 합성 관측으로 돌아가되, **어느 쪽을 썼는지 응답과 적용 기록에 남긴다** — 합성으로 낸 설정점을 실측인 줄 알고 설비에 넣으면 그 매장에서 한 번도 관측되지 않은 값이 운전점이 된다
  **EC 결측은 행이 아니라 열을 뺀다.** 채우면 EC 열이 상수에 가까워져 회귀가 채움값 주변의 잡음을 곡률로 읽고 "자신 있어 보이는 가짜 최적 EC"를 낸다. 빼면 EC를 안 재는 매장은 0행이 되어 나머지 다섯 요인까지 학습이 꺼진다. 측정률이 60% 이상이면 결측 사이클만 버리고 6요인으로, 그 아래면 모든 행의 EC를 같은 값으로 눕혀 분산을 0으로 만든다 — 곡률이 안 잡히므로 파이프라인이 스스로 EC를 뺀다. `ecCoverage`·`droppedFeatures`로 어느 쪽인지 내려준다
  접기 규칙 셋을 테스트로 고정했다 — 명기 조도만 DLI로 적산(암기를 섞으면 광량이 절반이 된다) · 한쪽 시간대가 없으면 주야 진폭을 `undefined`로 둔다(0은 "내내 같았다"는 주장이다) · 상한 초과 시간은 측정 간격을 곱한 값이다
  수확량 단위는 봉/㎡다. 봉당 무게를 아는 표가 없다 — 최적점은 y에 양수 상수를 곱해도 안 움직이므로 학습에는 문제가 없고, 절대 수량을 말할 때만 걸린다
- [x] **W2** 최적화 적용 — `lib/setpoint-envelope.ts` · `GET|POST /api/projects/[id]/setpoints`
  **결정론적 봉투**를 세웠다. 학습 산출을 그대로 설비에 넘기지 않고 규칙이 먼저 판단한다 — 반응면이 안장·판정불가거나 최적점이 관측 경계에 붙으면 채택하지 않고, 통과한 값만 농학 범위·설비 정격(LED 최대 DLI)·하루 변화폭으로 좁힌다. **학습은 좁힐 수만 있고 규칙이 허용한 폭을 넓히지 못한다.** 이 설정점이 IoT 가동률 → 마일스톤 2·4단계 판정 → 트랜치 집행으로 이어지므로 마지막 결정은 규칙이 갖는다.
  거부·조정 사유를 값으로 남긴다(`APPLIED` · `CLAMPED_AGRONOMIC` · `CLAMPED_EQUIPMENT` · `CLAMPED_RATE` · `REJECTED_SURFACE` · `REJECTED_BOUNDARY` · `REJECTED_INVALID`). 산출값과 적용값을 `SetpointApplication`에 **둘 다** 저장한다 — 하나만 남기면 모델을 고칠 근거가 사라진다. 정산·판정에는 적용값을 쓴다.
  변화폭은 요인마다 다르다. pH가 가장 좁다(구간의 8%) — 과보정이 회복을 더 어렵게 한다.
- [x] **W3** 기관 성과 리포트 화면 — `/admin/reports` (A-11)
  Figma A-11이 정산 결과라 붙을 화면이 없었다. A2 토큰·A3 컴포넌트로 새로 그렸다. 기관·기간을 고르고 지점별 수확·판매·매출·이상 비율을 본다. `format=csv`로 같은 표를 내려받는다(Excel이 열도록 BOM)
  **API가 인증 없이 열려 있었다.** 지점별 매출이 그대로 나오는 경로인데 세션 검사가 없었다. `requireRole("admin")`을 걸었다. 기관 목록은 `institutionId` 없이 부르면 나온다 — 그것만을 위한 라우트를 따로 두면 같은 권한 검사를 두 번 쓰게 된다
  IoT 측정이 0건인 지점은 이상 비율을 `0%`가 아니라 "측정 없음"으로 쓴다. 0%는 "이상이 없었다"는 주장이고, 안 잰 것과 다르다
- [x] **W4** 구독 상세 변경 — `lib/subscription-window.ts`
  건너뛰기·일시정지·해지는 이미 있었고 **마감이 없었다.** 명세 17.1-9의 두 마감을 한 곳에 두고 서버가 판정한다 — 픽업 3시간 전(매장이 팩을 담기 시작하는 시점), 다음 결제일 전날 끝(결제일 당일 해지는 "돈은 나갔는데 해지됐다"가 된다). 지나면 `409 PICKUP_CHANGE_CLOSED` · `409 CANCEL_CLOSED`에 마감 시각을 실어 보낸다
  **주기 변경이 임박한 회차를 지우지 않는다.** 예정 회차를 전부 지우고 다시 만들고 있었는데, 그러면 매장이 이미 담기 시작한 팩이 조용히 사라진다. 마감이 지난 회차는 남긴다
  이미 수령·건너뛴 회차에 다시 요청하면 `409 PICKUP_NOT_SCHEDULED`. 수령 처리(`picked`)에는 마감을 걸지 않는다 — 매장이 실제로 건네준 사실을 적는 것이라 시각으로 막을 것이 아니다
  B-08 화면에 해지를 붙이고(확인 한 단계), 마감이 지난 버튼은 아예 잠근다. 화면과 서버가 같은 함수를 쓴다 — 각자 계산하면 열려 있는 버튼이 거절당한다

## 명세와 화면 목록이 어긋나는 곳

화면 ID는 Figma와 명세가 서로 다른 것을 가리킨다. 기능을 붙일 때 ID가 아니라 이름으로 찾는다.

| 명세 | Figma | 영향 |
|---|---|---|
| O-12 매장 운영 현황(조회) | O-12 마일스톤 집행 완료 | 웹에 만들지 않는다. 최종본에도 운영 현황 화면이 없고 운영자 상단 메뉴가 `공간 찾기 · 내 준비 현황 · 보증서` 셋뿐이다 — 생육·재고·설비·매출은 앱(`app/src/app/farm/`)이 맡는다 |
| O-13 생육 레시피·환경 최적화 | O-13 정산·지급 내역 | W1·W2는 Phase J1의 `/optimization/[projectId]`에 붙는다 |
| A-10 매출·비용 입력 | A-16 매출·비용 입력 (`/admin/ledger`) | S1은 A-16에 붙인다 |
| A-11 기관 성과 리포트 | A-11 정산 결과 | W3을 `/admin/reports`에 새로 그렸다 |

네 줄 모두 최종 `.fig`로 닫혔다. 웹 운영자 포털의 범위는 신청 → 계약 → 보증서 → 증빙 → 집행 → 정산이고, 매일 매장에서 하는 일은 앱이 맡는다. 최종본에 없는 화면은 A2 토큰과 A3 컴포넌트로 새로 그린다(Phase J와 같은 방식).

---

## Phase X · 도면 대조로 드러난 차이

`.fig`의 고정 문구가 실제 렌더에 나오는지 기계로 센다. 빠진 문구가 도면과 코드의 차이다.

```
npm run seed                      # 시나리오 먼저 (빈 화면은 통째로 빠진 것처럼 세어진다)
python tools/figma/labels.py      # 덤프 → 화면별 고정 문구
node tools/figma/audit.mjs        # 렌더와 대조
```

시드를 다시 넣으면 id가 바뀐다. `tools/figma/audit-ids.json`을 그때 값으로 채운다.

**읽는 법**: 숫자는 `빠진 문구 / 도면 문구`다. 도면의 가짜 이름(박운영·그린테이블·성수 등)은
시드 이름과 다를 수밖에 없어 따로 센다 — 그 몫은 고칠 대상이 아니다.
어떤 문구가 빠졌는지는 `tools/figma/audit.json`에 그대로 적힌다.

합계 **312 / 1419** (그중 가짜 이름 72). 기준선은 509였다.

- [ ] **O-10** 19/46 · 가짜 이름 4 — `/operator/milestones`
- [ ] **O-07** 13/24 · 가짜 이름 2 — `/operator/apply/contract`
- [ ] **O-11E** 11/31 · 가짜 이름 4 — `/operator/milestones/[마일스톤]/appeal`
- [ ] **O-03** 13/50 · 가짜 이름 1 — `/operator/apply`
- [ ] **O-11** 11/43 · 가짜 이름 3 — `/operator/milestones/[마일스톤]/evidence`
- [ ] **A-07** 13/40 · 가짜 이름 1 — `/admin/projects/[1호점]/milestones`
- [ ] **A-13** 10/43 · 가짜 이름 4 — `/admin/roles`
- [ ] **A-08** 11/31 · 가짜 이름 1 — `/admin/evidence`
- [ ] **A-02** 6/32 · 가짜 이름 5 — `/admin/operators`
- [ ] **A-06** 7/38 · 가짜 이름 4 — `/admin/projects`
- [ ] **A-15** 10/38 · 가짜 이름 1 — `/admin/aml`
- [ ] **A-12** 5/45 · 가짜 이름 5 — `/admin/audit-logs`
- [ ] **O-08** 7/28 · 가짜 이름 2 — `/operator/certificate`
- [ ] **O-09** 7/30 · 가짜 이름 1 — `/operator`
- [ ] **O-12** 6/12 · 가짜 이름 2 — `/operator/milestones/[마일스톤]/done`
- [ ] **A-01** 5/34 · 가짜 이름 3 — `/admin`
- [ ] **A-09** 6/37 · 가짜 이름 2 — `/admin/expert-review`
- [ ] **C-01** 4/33 · 가짜 이름 3 — `/`
- [ ] **A-04** 5/28 · 가짜 이름 2 — `/admin/spaces`
- [ ] **B-01** 4/13 · 가짜 이름 2 — `/subscribe`
- [ ] **B-08** 5/19 · 가짜 이름 1 — `/subscriptions/change`
- [ ] **O-05** 5/15 · 가짜 이름 1 — `/operator/apply/education`
- [ ] **O-01** 4/21 · 가짜 이름 1 — `/operator/spaces`
- [ ] **O-02** 4/31 · 가짜 이름 1 — `/operator/spaces/[공간]`
- [ ] **O-06** 3/21 · 가짜 이름 2 — `/operator/apply/confirm`
- [ ] **I-05** 4/20 — `/investor/applications`
- [ ] **B-02** 3/7 · 가짜 이름 1 — `/subscribe/plan`
- [ ] **B-07** 3/17 · 가짜 이름 1 — `/subscriptions`
- [ ] **I-06** 3/20 — `/investor`
- [ ] **I-07** 3/31 — `/investor/holdings`
- [ ] **I-09** 3/16 — `/investor/notifications`
- [ ] **B-04** 2/24 · 가짜 이름 1 — `/subscribe/order`
- [ ] **B-05** 2/39 · 가짜 이름 1 — `/subscribe/payment`
- [ ] **B-09** 3/11 — `/subscriptions/pickup/[회차]`
- [ ] **O-04** 1/15 · 가짜 이름 2 — `/operator/apply/visit`
- [ ] **A-03** 1/29 · 가짜 이름 2 — `/admin/certificates`
- [ ] **A-14** 2/40 · 가짜 이름 1 — `/admin/notifications`
- [ ] **A-16** 2/41 · 가짜 이름 1 — `/admin/ledger`
- [ ] **C-02** 2/10 — `/login`
- [ ] **C-03** 2/13 — `/signup`
- [ ] **C-I03** 2/7 — `/verify/account`
- [ ] **I-01** 2/51 — `/projects/[3호점]`
- [ ] **I-02** 2/60 — `/projects/[3호점]/invest/eligibility`
- [ ] **B-06** 1/11 · 가짜 이름 1 — `/subscribe/done`
- [ ] **O-13** 1/26 · 가짜 이름 1 — `/operator/settlements`
- [ ] **C-I02** 1/8 — `/verify/mobile-id`
- [ ] **C-I05** 1/8 — `/verify/done`
- [ ] **A-10** 0/40 · 가짜 이름 1 — `/admin/settlement-rules`
- [ ] **A-11** 0/42 · 가짜 이름 1 — `/admin/settlements`

---

## 검증

- 타입: `cd frontend && npx tsc --noEmit`
- 렌더: `npm run dev` → 각 라우트를 열어 `design/screens/farmfi-web/<페이지>/<ID>.txt`와 대조 (색 hex·폰트 크기·간격)
- 데이터: 화면 교체 전후로 같은 데이터가 나오는지
- 용어: `.fig` 문구와 같은지
- 프로덕션 빌드: Vercel 프리뷰 배포 (로컬 `next build`는 한글 경로 EISDIR로 실패)

**잔여 기능 (Phase O~W)**
- 통과 기준은 `feature-spec.md` 18장의 역할별 인수 테스트를 쓴다 — 중복 은행 웹훅이 와도 투자금 1회 반영, 같은 `eventId`로 재시도해도 보유 구좌 이중 발행 없음, 승인되지 않은 마일스톤은 집행 API가 거부
- 어댑터는 Mock 구현체로 흐름 전체가 도는 것까지 확인한다

## 범위 밖

- 운영자 앱(`app/`)과 앱만 호출하는 API — 다른 담당. 스키마가 겹칠 때만 맞춘다
- `contracts/` 컨트랙트 코드 — 함수 매핑만 Phase P2에서 정하고, 수정이 필요하면 별도 단위로 뺀다
- 외부 사업자 실계약 — 은행·PG·신탁·모바일 신분증 실 API는 명세 17.3 게이트다. 전부 Mock 어댑터로 개발한다
- 투자 모집 기능의 실제 활성화 — 법률 검토와 금융 파트너 승인 전까지 feature flag로 비활성(명세 17.1-5)
