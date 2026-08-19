# 개발 계획 · 화면 98개 + 기능

Figma 확정 화면을 옮기면서, 그 화면이 실제로 도는 데 필요한 API·모델을 같이 만든다. 화면과 기능을 짝으로 완성해 어느 시점에 멈춰도 그 지점까지는 동작하는 데모가 되게 한다.

| 대상 | Figma 원본 | 화면 | 현재 코드 |
|---|---|---|---|
| 웹 `frontend/` | `design/farmfi-web.fig` | 62 | 페이지 17 |
| 운영자 앱 `app/` | `design/farmfi-app.fig` | 36 | 화면 8 |

추출한 화면 트리는 `design/screens/<파일명>/<페이지>/<화면>.txt`에 있다. 한 줄이 노드 하나이고 절대좌표·크기·색·폰트가 그대로 적혀 있다. Figma가 갱신되면 `.fig`를 교체하고 `python tools/figma/extract.py`를 다시 돌린다.

## 이어서 하기

**다음 작업 = 아래에서 체크 안 된 첫 항목.**

작업 단위 하나를 끝낼 때마다:
1. `- [ ]`를 `- [x]`로 바꾸고
2. 검증(`npx tsc --noEmit` + `npm run dev` 육안)을 통과시킨 뒤
3. 그 단위만 커밋한다 (`feat:` / `fix:` / `docs:` 접두)
4. 판단이 갈렸던 지점은 `dev-log.md` 맨 위에 한 줄 남긴다

세션이 바뀌어도 이 파일의 체크 상태가 진행 상황의 정본이다.

## 원칙

디자인이 기준이다. Figma 화면 목록과 생김새를 그대로 옮긴다. 기능명세서는 Figma가 표현할 수 없는 것(API·상태·권한·금지 용어)에만 적용한다.

| 항목 | 결정 |
|---|---|
| 화면 목록 | Figma 62개(웹) + 36개(앱) |
| 생김새 | Figma가 절대 기준 (좌표·색·폰트·radius) — 아래 그라운드 룰이 이기는 경우만 예외 |
| 데이터 층 | 기존 `components/farmfi/**/api.ts` 재사용. 없는 것만 신규 |
| 기존 API route 47개 | 무수정 (신규 추가는 함) |
| 스타일링 | Tailwind + `tailwind.config.ts` 토큰 |
| 기존 화면 코드 | 새로 작성 후 교체 (기존 JSX 수정 아님) |
| `globals.css` | 손대지 않음. 이식이 끝날 때까지 기존 페이지가 계속 동작 |
| Figma에 없는 6개 | 유지하다가 Phase J에서 Figma 톤으로 재디자인 |

### 명세가 디자인을 이기는 3가지

Figma가 v2.1 용어 패치 이전 버전이라 금지 용어가 남아있다. 문구만 교체하고 레이아웃은 유지한다.

1. **금지 용어** — 화면 11개에 잔존: `토큰`(I-01·I-07·I-08), `지갑`(A-15·I-01·I-07·O-03·O-07), `배당`(8개), `락업`(I-04), `증권`(I-01).
   → `투자 금액` / `보유 구좌` / `회수금·지급 예정액` / `등록 계좌` / `모바일 신분증 확인`
2. **O-11·A-08은 P0** — Figma는 Phase 2 존에 그렸지만 `team-handoff-v2.1.md` 2-D가 "존 위치와 무관하게 MVP"로 명시
3. **I-07 보유 표기** — `보유 수량·토큰` → `투자 금액 / 보유 구좌 / 계약 상태`

## 그라운드 룰

전 화면에 걸리는 규칙이다. Figma와 어긋나면 이쪽을 따른다.

### 색은 브랜드 초록·빨강·회색 계열만 쓴다

Figma에는 상태를 여러 색으로 나눈 흔적과 틴트가 남아있다 — 웹에 노랑 계열 6종(`#D1A84D` `#F2D680` `#FAE8B8` `#FCF5E0` `#9E7324` `#D9941F`), 파랑 2종(`#296BAD` `#BFE0EB`), 연한 빨강 배경(`#FCF0F0` `#FAF0ED`). 앱에는 황색 2종과 `#9747FF`(Figma 기본값 잔재)가 있다. 전부 쓰지 않는다.

**쓸 수 있는 색은 이것뿐이다.**

| 역할 | 값 | 어디에 |
|---|---|---|
| ink | `#1A1A1A` | 본문·제목 |
| body | `#4A4A4A` | 보조 본문 |
| muted | `#8A8A8A` | 라벨·비활성 |
| line | `#E5E5E3` | 테두리 |
| line-soft | `#EDEDEB` | 구분선 |
| surface | `#F2F2F0` | 면 |
| brand | `#14542E` | 제한 없음 — 버튼·링크·활성 탭·통과·강조 |
| danger | `#A34A3D` | 실패·거부·삭제 |
| brand-soft | `#EAF6EE` | 브랜드 강조의 옅은 배경 |

- 한 화면에서 색을 세 단계 이상으로 갈라 등급을 표시하지 않는다. 등급이 필요하면 텍스트 라벨과 테두리·채움 유무로 말한다.
- danger는 한 값뿐이다. 연한 빨강 배경을 따로 만들지 않는다.
- 차트·진행률은 brand green의 명도 단계와 회색 농담으로 구분한다. 시리즈가 많으면 색 대신 라벨·패턴을 쓴다.

### 웹과 앱은 같은 팔레트를 쓴다

Figma는 웹 `#14542E`, 앱 `#1B5E3F`로 초록이 다르다. **웹 값으로 통일한다.** ink·muted·line도 웹 값을 앱에 적용한다.

### 데스크톱 먼저, 구조는 유동적으로

반응형은 나중에 붙인다. 지금은 데스크톱(1440)만 확인한다. 다만 **절대좌표로 짜지 않는다** — `max-width` + flex/grid + `rem`으로 짜야 나중에 브레이크포인트만 추가하면 된다. 고정 px 좌표로 짜면 반응형은 재작성이 된다.

Figma 덤프의 좌표는 **간격을 읽는 용도**지 그대로 옮길 값이 아니다. `@33,442`와 `@207,442`는 "왼쪽 여백 33px, 두 버튼 사이 10px"로 읽는다.

### 글자 크기는 스케일 한 곳에서 조절한다

웹 텍스트의 40%가 12px이라 빔프로젝터 발표에서 읽기 어렵다. 모든 치수를 `rem`으로 쓰고 루트 폰트 크기 하나로 전체를 키울 수 있게 둔다. 기본값은 Figma 그대로(1.0), 발표 직전에 필요하면 1.2로 올린다.

## 디자인 토큰

`.fig`에서 추출한 실제 값에 그라운드 룰을 적용한 것. 웹과 앱이 같은 색을 쓴다.

```
색     ink #1A1A1A · body #4A4A4A · muted #8A8A8A
       line #E5E5E3 · line-soft #EDEDEB · surface #F2F2F0
       brand #14542E · brand-soft #EAF6EE
       danger #A34A3D (실패·거부·삭제)
폰트   Pretendard(한글) + Inter(숫자·영문)
크기   11 12 13 14 15 · 강조 20 22 24 28 — rem으로 쓰고 루트에서 일괄 조절
radius 6 · 8 · 10 · 12 · 14 · 999
```

굵기는 웹이 Regular/Medium/SemiBold/Bold, 앱이 Regular/SemiBold/Bold를 쓴다. 폭은 웹 본문 1440·패널 730·모달 465, 앱 402(높이 874~1265)다.

## 백엔드 현황

`/api/subscribe`는 정기구독이 아니라 **투자 청약**이다. `lib/subscription.ts`의 `executeSubscription`이 본인인증·연간한도·재고 검증 후 `TokenHolding`을 만든다.

| 영역 | 있는 것 | 없는 것 |
|---|---|---|
| 인증 | `auth/*`, `identity/*` | — |
| 투자 | `projects`, `portfolio`, `payouts`, `subscribe`(단일 호출) | 다단계 신청 상태(`Investment` 모델), 적합성 판정 |
| 마일스톤 | `milestones/[id]/verify·complete·timeout`, AI 검증 4종 | 증빙 제출·승인 게이트 (`submitEvidence` / `approveMilestone`) |
| 운영자 | `operator-applications`, `spaces` | 방문 예약, 교육 이수, 계약 서명 |
| 정기구독(구매자) | `Product`, `Inventory`, `HarvestRecord`, `SalesRecord` | **모델·API 전부** |
| 관리자 | `admin/notify`, `audit-logs`, `appeals`, `reports/institution` | 증빙 재검토 |

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

## 앱 화면 36개

Figma에 우선순위 표시가 없다. 화면 번호(`00`~`25`)가 흐름 순서다.

| 묶음 | 화면 |
|---|---|
| 진입 | Splash, 00 로그인, 01 매장 선택, 00 scan 3종(시도·인식 성공·승인 완료) |
| 대시보드 | 02 대시보드(+로딩), 03 설비 알림 |
| 생육 | 04 재배생육 현황(+로딩), 05 생육 상세, 06 재배 일정, 07 일정 등록, 08 실시간 모니터링(+로딩), 09 베드 상세, 10 센서 이력, 11 센서 임계값 |
| 재고 | 12 재고생육 연동(+로딩), 13 재고 상세·조정, 14 재고 품목 등록 |
| 매출 | 15 판매 리포트(+로딩), 16 거래 내역, 17 리포트 내보내기 |
| 설정 | 18 설정, 19 알림 설정 |
| 상태·예외 | 20 제어 성공, 21 제어 실패, 22 재고 부족, 23 로그아웃 확인, 24 작물 없음, 25 매출 없음 |

`Internal Only Canvas`에 `App/*` 컴포넌트 30종(`MetricTile` `BedCard` `SensorTile` `LineChart` `BottomNav` 등)이 정의돼 있다. 화면 덤프의 `INSTANCE "App/..."` 줄이 이 컴포넌트를 가리키고, 내부 내용은 `Internal_Only_Canvas/` 안의 같은 이름 파일에 있다.

현재 앱 코드는 화면 8개(`login`, `index`, `farm/{store,growth,monitoring,inventory,sales,assignment}`)다. Figma 36개와 겹치는 것은 이름이 아니라 기능 기준으로 대응시킨다.

---

## Phase A · 기반

- [x] **A1** Figma 추출 도구 저장소 고정
  `design/farmfi-{web,app}.fig` 원본 · `tools/figma/kiwi.py`(kiwi 디코더) · `tools/figma/extract.py`(화면 트리 생성) · 결과물 `design/screens/`도 커밋
  검증: `python tools/figma/extract.py` → 웹 129 · 앱 73개 재생성
- [ ] **A2** 웹 디자인 토큰 + 라우트 매핑표
  `frontend/tailwind.config.ts`에 색·폰트·radius 등록 · `layout.tsx`에 Inter 추가 · `docs/figma-route-map.md`에 62행 매핑표 + 금지 용어 치환표 + 등급색 치환표
- [ ] **A3** 웹 공용 UI 컴포넌트 11종
  `frontend/src/components/ui/` — `Button` `Card` `Badge` `ProgressBar` `StatRow` `DataTable` `Field` `Modal` `StepLine` `EmptyState` `AppHeader`
  기존 `components/farmfi/**`는 무수정(구 디자인 전용으로 남김)

## Phase B · 공통·인증 (신규 API 없음)

- [ ] **B1** C-01 서비스 홈 → `/`
- [ ] **B2** C-02 로그인 · C-03 회원가입 → `/login` `/signup` (`auth/*` 재사용)
- [ ] **B3** C-04 이용 목적 선택 → `/start` (투자자·구매자·운영자 3분기)
- [ ] **B4** 투자자 본인확인 5개 — C-I01 방법 선택 · C-I02 모바일 신분증 확인 · C-I02E 확인 실패 · C-I03 본인 명의 계좌 확인 · C-I05 완료
  → `/verify/*`. 기존 `identity/*` API와 `components/farmfi/identity/api.ts` 재사용
  C-I03의 레이어 이름에 옛 지갑 잔재(`공식 앱 안내`·`설치 순서`·`스토어 버튼`)가 남아있다. 표시 텍스트는 계좌 확인이 맞으므로 이름만 계좌 기준으로 옮긴다

## Phase C · 투자자

- [ ] **C1** I-01 프로젝트 상세 → `/projects/[id]` · I-06 투자자 홈 → `/investor`
  기존 `projects`, `projects/[id]` API 재사용. 금지 용어 치환 적용
- [ ] **C2** `Investment` 모델 + 신청 상태 API
  상태: `DRAFT → IDENTITY_REQUIRED → ELIGIBILITY_CHECKED → CONSENT_REQUIRED → AWAITING_DEPOSIT → DEPOSIT_CONFIRMED → CHAIN_PENDING → COMPLETED` (+ `CHAIN_FAILED`)
  `executeSubscription`을 이 흐름의 납입 단계로 감싼다 — 새 파이프라인 신설 아님
- [ ] **C3** I-02 적합성 확인 · I-03 최종확인·전자서명·납입 · I-04 신청 완료
  → `/projects/[id]/invest/{eligibility,confirm,done}`
- [ ] **C4** I-02E 부적격 안내 · I-03E 납입 실패 (모달·상태 분기)
- [ ] **C5** I-07 보유 투자 → `/investor/holdings` · I-08 회수 상세 → `/investor/payouts/[id]`
  `TokenHolding`을 `투자 금액 / 보유 구좌 / 계약 상태`로 표기. 원장 원문(주소·txHash·토큰수량) 응답 제외

## Phase D · 마일스톤 증빙 게이트 (P0 핵심)

조건부 집행의 핵심. 증빙이 `APPROVED`가 아니면 집행 API가 거부한다.

- [ ] **D1** `Milestone` 상태 흐름 확장 + 증빙 API
  `SCHEDULED → EVIDENCE_SUBMITTED → REVIEWING → APPROVED → EXECUTION_REQUESTED → PAID` (+ `REVISION_REQUIRED`)
  `POST /api/milestones/[id]/evidence`(운영자 제출) · `POST /api/milestones/[id]/approve`(관리자 승인)
  기존 `verify`(AI 검증 4종)를 `REVIEWING` 단계에 연결
- [ ] **D2** O-11 증빙 제출 → `/operator/milestones/[id]/evidence`
- [ ] **D3** A-08 증빙 재검토 → `/admin/evidence`

## Phase E · 운영자

- [ ] **E1** O-01 공간 탐색 · O-02 공간 상세 → `/operator/spaces`, `/operator/spaces/[id]` (`spaces` API 재사용)
- [ ] **E2** O-03 자격·서류 신청 → `/operator/apply` (`operator-applications` 재사용)
- [ ] **E3** O-04 방문 예약 · O-05 필수 교육 → `/operator/apply/{visit,education}` (**API 신규**)
- [ ] **E4** O-06 공간 최종 확정 · O-07 계약 전자서명 → `/operator/apply/{confirm,contract}` (**API 신규**)
- [ ] **E5** O-08 보증서 발급 · O-09 개점 준비 현황 → `/operator/certificate`, `/operator`

## Phase F · 구매자 (백엔드 신규가 가장 큼)

- [ ] **F1** `Subscription` 모델 + 정기구독 API
  픽업 지점 · 팩 크기 · 수령 주기 · 회차. `Product`/`Inventory` 연결
- [ ] **F2** B-01 픽업 지점 · B-02 팩 크기·주기 · B-03 재고 기반 구성 → `/subscribe/*`
- [ ] **F3** 결제 API + B-04 주문서 · B-05 결제수단·자동결제 · B-06 신청 완료
- [ ] **F4** B-07 내 구독 현황 → `/subscriptions` · B-09 픽업 바코드 → `/subscriptions/pickup/[id]`
- [ ] **F5** B-04M 쿠폰 모달 · B-00E 구독 없음 빈 상태

## Phase G · 관리자

- [ ] **G1** A-01 콘솔 홈 → `/admin`
- [ ] **G2** A-02 운영자 심사·가배정 · A-03 보증서 발급 관리 → `/admin/operators`, `/admin/certificates`
- [ ] **G3** A-04 공간·설비 구성 → `/admin/spaces`
- [ ] **G4** A-06 투자 프로젝트 관리 · A-07 마일스톤 설정 → `/admin/projects`, `/admin/projects/[id]/milestones`

## Phase H · v2.1 용어·모델 정리

- [ ] **H1** 화면·API·로그에서 금지 용어 제거
  `Escrow` → 신탁(custody) · `TokenHolding` → 보유 구좌 · `Dividend` → 회수금
  검증: `grep -rE '토큰|지갑|에스크로|배당|락업|증권|STO' frontend/src` → 0건
- [ ] **H2** `DEPRECATED · 지갑 주소 등록` / `지갑 재연결` 라우팅 제외, 기존 URL은 리다이렉트

## Phase I · Phase 2 화면 17개

- [ ] **I1** 투자자 I-05 신청·취소 내역 · I-09 알림함 · I-10 알림 설정
- [ ] **I2** 구매자 B-08 구성·일정 변경
- [ ] **I3** 운영자 O-10 검증 현황 · O-11E 이의제기 · O-12 집행 완료 · O-13 정산·지급 내역
- [ ] **I4** 관리자 A-05 구독·픽업 예외 · A-09 외부 전문가 판정 · A-10 정산 규칙 · A-11 정산 결과
- [ ] **I5** 관리자 A-12 감사 로그 · A-13 권한 관리 · A-14 알림 발송 · A-15 AML·이상거래 · A-16 매출·비용 입력

## Phase J · 기존 6개 재디자인

Figma에 원본이 없으므로 A2 토큰과 A3 컴포넌트로 새로 그린다.

- [ ] **J1** `/monitoring/[projectId]` · `/optimization/[projectId]` (AI 검증 핵심 화면)
- [ ] **J2** `/landlord` · `/about` · `/admin/demo` · `/verify-identity`

## Phase K · 웹 정리

- [ ] **K1** `globals.css` 미사용 클래스 제거
- [ ] **K2** `components/farmfi/**` 중 화면 전용 파일 삭제 (데이터 층 `api.ts`는 유지)

## Phase L · 앱 기반

앱은 `app/` (Expo RN). 그라운드 룰대로 웹과 같은 팔레트를 쓴다. 데이터도 웹과 같은 API를 쓴다.

- [ ] **L1** 앱 디자인 토큰
  `app/src/farmfi/theme.ts` — 웹과 같은 토큰(색·크기·radius) 상수화. 기존 `src/farmfi/components.tsx`가 쓰는 값과 대조해 하나로 합침
- [ ] **L2** `App/*` 컴포넌트 30종 중 화면이 실제로 쓰는 것부터
  `MetricTile` `SectionTitle` `AlertCard` `BedCard` `CropProgressRow` `StockRow` `SensorTile` `DeviceRow` `LineChart` `BarChart` `Field` `PrimaryButton` `GhostButton` `BottomNav` `EmptyState` `Popup` `Calendar` `SkeletonBlock`
  정의는 `design/screens/farmfi-app/Internal_Only_Canvas/`

## Phase M · 앱 화면 36개

- [ ] **M1** 진입 6개 — Splash, 00 로그인, 01 매장 선택, 00 scan 3종
- [ ] **M2** 대시보드 3개 — 02 대시보드(+로딩), 03 설비 알림
- [ ] **M3** 생육 10개 — 04~11 (재배 현황·상세·일정·등록·실시간·베드·센서 이력·임계값)
- [ ] **M4** 재고 4개 — 12(+로딩), 13 상세·조정, 14 품목 등록
- [ ] **M5** 매출 4개 — 15(+로딩), 16 거래 내역, 17 리포트 내보내기
- [ ] **M6** 설정·상태 9개 — 18·19 설정, 20~25 결과·예외·빈 상태

---

## 검증

**웹**
- 타입: `cd frontend && npx tsc --noEmit`
- 렌더: `npm run dev` → 각 라우트를 열어 `design/screens/farmfi-web/전체/<ID>.txt`와 대조 (색 hex·폰트 크기·간격)
- 데이터: 화면 교체 전후로 같은 데이터가 나오는지
- 용어: 위 grep 0건
- 프로덕션 빌드: Vercel 프리뷰 배포 (로컬 `next build`는 한글 경로 EISDIR로 실패)

**앱**
- 타입: `cd app && npx tsc --noEmit`
- 렌더: USB 안드로이드 기기에서 실행 (`docs/dev-log.md`의 Expo 실행 절차)
- 대조: `design/screens/farmfi-app/Page_1/<번호>_<이름>.txt`

## 범위 밖

- `contracts/` — 변경 없음
- 수탁 지갑 · `HoldingLedger` · `FundCustodyAdapter` — `team-handoff-v2.1.md` PART 1의 체인 작업. 화면에 노출되지 않으므로 이 계획에 포함하지 않는다
