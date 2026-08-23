# FarmFi 개발 구조 — 지향점

이 문서는 FarmFi가 완성됐을 때 어떤 구조로 동작하는지, 그리고 왜 그 구조여야 하는지를 적는다.
읽고 나면 "투자자가 버튼을 누른 뒤 돈이 운영자에게 닿기까지 어떤 층을 지나는가", "그 경로에서
사람이 임의로 끼어들 수 없게 만드는 장치가 무엇인가"에 답할 수 있어야 한다.

무엇을 만들지는 `feature-spec.md`·`app-feature-spec.md`가, 어디까지 만들었는지는 `build-plan.md`의
체크박스가 담당한다. 이 문서는 그 사이 — **왜 층을 이렇게 갈랐는가**를 다룬다. 계산 근거는 별도로
`optimization-rationale.md`(운영최적화)와 `growth-recipe-rationale.md`(생육 레시피)에 있다.

§1~§14는 완성 시점의 구조를 기술한다. 현재 구현 범위와의 차이는 §15에 모아 뒀다.

---

## 0. 한 장 요약

**무엇을 만드나.** 도심 유휴공실을 스마트팜 매장으로 바꾸는 자금을 토큰증권(STO)으로 조달하고,
그 자금을 한 번에 주지 않고 **공사·설비·개점이 실제로 이뤄졌다는 증거가 확인될 때마다** 나눠 집행한다.

**기술적 핵심 주장은 하나다.** "조건이 충족되면 집행한다"가 약속이 아니라 **코드**여야 한다.
운영자가 사진을 올리고 관리자가 승인 도장을 찍는 구조라면 기존 보조금 집행과 다를 게 없다.
그래서 집행 직전에 관문 셋을 두고, 그중 어느 하나도 사람이 우회할 수 없게 만든다.

| 층 | 질문 | 무엇이 답하나 |
|:---|:---|:---|
| 표현 | 무엇을 보여주나 | `app/**/page.tsx` (얇은 라우트) → `components/screens/**` |
| 조회 | 화면이 데이터를 어떻게 얻나 | `components/screens/api.ts` — React Query 단일 통로 |
| 경계 | 누가 무엇을 할 수 있나 | `app/api/**/route.ts` + `lib/auth.ts`의 `requireRole` |
| 신원 | 누구인지 어떻게 아나 | 모바일 신분증(OmniOne CX / OpenDID VP) → `lib/identity/` |
| 도메인 | 규칙이 어디 있나 | `lib/*.ts` — 자금 · 집행 게이트 · 최적화 · 체인 |
| 저장 | 사실이 어디 남나 | Prisma 7 + PostgreSQL (모델 47개) |
| 외부 | 우리가 아닌 것과 어떻게 만나나 | 어댑터 인터페이스 + Mock 구현체 |
| 체인 | 무엇을 남에게 증명하나 | `contracts/*.sol` ← Chain Relay(아웃박스) |

**한 문장으로 규정하면.** 판단은 결정론적 코드가 하고, LLM과 사람은 그 판단을 **호출·통역**할 뿐이다.
이 원칙이 §8(집행 게이트)·§10(AI 계층)·§11(운영·학습 계층) 세 곳에서 같은 모양으로 반복된다.

---

## 1. 저장소와 런타임 구성

| 디렉터리 | 무엇 | 스택 | 담당 |
|:---|:---|:---|:---|
| `frontend/` | 웹 화면 + API + 도메인 로직 | Next.js 14 App Router · TypeScript · Tailwind | 웹 |
| `app/` | 운영자 앱 | Expo React Native (Android) | 앱 |
| `contracts/` | 스마트 컨트랙트 | Foundry · Solidity 0.8.24 · OpenZeppelin | 공유 |
| `design/` | Figma 원본(`.fig`)과 화면별 좌표·색·폰트 덤프 | — | 공유 |
| `docs/` | 명세 · 근거 · 계획 | — | 공유 |
| `iot-mock/` · `tools/figma/` | IoT 목업 · Figma 덤프 도구 | — | 공유 |

인프라는 **Vercel(Linux) + Supabase(PostgreSQL)**다. 도커를 쓰지 않는다.

`frontend/` 규모: 화면 라우트 66개, API 라우트 92개, 도메인 모듈 65개, Prisma 모델 47개.

주요 의존성은 넷으로 묶인다.

| 묶음 | 패키지 |
|:---|:---|
| 데이터 | `@prisma/client` 7 · `@prisma/adapter-pg` · `pg` · `@supabase/supabase-js` |
| 인증 | `jose`(JWT) · `bcryptjs` |
| 체인 | `viem` 2 |
| AI | `@google/genai` · `openai` · `@anthropic-ai/sdk` |
| 화면 | `@tanstack/react-query` · `recharts` · `framer-motion` |

---

## 2. 왜 프론트와 백엔드를 가르지 않았나

Next.js 하나가 화면과 API를 함께 낸다. 별도 API 서버를 두지 않았다.

**① 경계가 하나면 인증도 하나다.** API 서버를 분리하면 세션을 두 곳에서 검증하게 되고, 두 검증이
어긋나는 순간이 그대로 취약점이 된다. `getServerSession()` 하나만 신뢰 원천이다.

**② 화면과 API가 같은 타입을 본다.** Prisma가 생성한 타입을 라우트와 화면 양쪽이 그대로 쓴다.
스키마를 고치면 `tsc --noEmit`이 두 쪽을 동시에 깨뜨린다 — 어긋난 채로 배포될 길이 없다.

**③ 배포 단위가 하나다.** "프론트는 새 버전인데 API는 옛 버전"인 상태가 존재하지 않는다.

대가는 분명하다. 웹 트래픽과 배치 작업이 같은 런타임을 공유하고, 앱(`app/`)이 이 서버를 호출하므로
웹 배포가 앱에 영향을 준다. 규모가 커지면 도메인 로직(`lib/`)만 떼는 것이 첫 분리선이다.
지금 `lib/`가 Next 런타임에 의존하지 않게 유지하는 이유가 그것이다.

---

## 3. 요청 하나가 지나가는 경로

```
브라우저
  └ app/operator/milestones/page.tsx        ← 라우트. 6줄. metadata와 컴포넌트 호출뿐
      └ components/screens/operator/MilestonesScreen.tsx   ← "use client". 화면 전부
          └ components/screens/api.ts       ← useQuery + 응답 타입. 화면은 fetch를 직접 쓰지 않는다
              └ app/api/milestones/route.ts ← requireRole → 입력 검증 → 도메인 호출 → 직렬화
                  └ lib/milestone-gate.ts   ← 규칙
                      └ lib/db.ts → PostgreSQL
```

**`page.tsx`를 얇게 두는 이유.** 라우트 파일에 로직이 들어가면 그 화면은 그 URL에서만 쓸 수 있다.
화면을 컴포넌트로 두면 관리자 화면이 운영자 화면 일부를 그대로 품을 수 있고, Figma 화면 ID와
파일이 1:1로 대응해 대조가 기계적으로 된다. 화면 컴포넌트는 역할별 디렉터리 여섯으로 나눈다 —
`investor` · `operator` · `landlord` · `buyer` · `admin` · `common`.

**`screens/api.ts`가 유일한 조회 통로인 이유.** 화면마다 `fetch`를 쓰면 응답 타입이 화면 수만큼
복제된다. 한 파일에 모으면 API 응답 모양이 바뀔 때 고칠 곳이 하나다. 캐시·재요청·로딩 상태도
React Query 한 곳에서 정해진다.

**라우트 핸들러의 책임은 넷으로 고정한다.** 권한 확인 · 입력 검증 · 도메인 함수 호출 · 직렬화.
규칙이 라우트 안에 들어가면 그 규칙은 그 HTTP 경로로만 부를 수 있고, 배치나 앱에서 같은 규칙이
필요할 때 복사본이 생긴다. 복사본 둘이 어긋나면 어느 쪽이 정본인지 코드가 말하지 못한다.

**`BigInt` 직렬화는 `lib/serialize.ts` 한 곳에서 처리한다.** 금액을 `bigint`로 다루므로
`JSON.stringify`가 그대로는 던진다. 라우트마다 변환하면 어떤 라우트는 문자열, 어떤 라우트는
숫자로 나가 화면이 두 형식을 모두 처리해야 한다.

---

## 4. 인증·세션·권한

**세션은 JWT 하나다.** HS256으로 서명해 httpOnly 쿠키(`session`)에 담고, 유효기간 7일.
`secure`는 프로덕션에서만, `sameSite`는 `lax`.

```
쿠키 없으면 → Authorization: Bearer <token>
```

쿠키를 쓸 수 없는 모바일 앱이 같은 토큰을 헤더로 보낸다. **웹과 앱이 같은 신원 체계를 쓴다** —
앱 전용 인증을 따로 만들면 권한 규칙이 두 벌이 된다.

**`JWT_SECRET`이 없으면 던진다.** 비어 있는 시크릿으로 서명·검증하면 누구나 토큰을 위조할 수 있다.
기본값으로 물러서는 경로를 두지 않는다.

**신원은 요청 본문에서 오지 않는다.** `userId`는 검증된 JWT의 `sub`에서만 읽는다. 클라이언트가
보낸 값을 신뢰하는 경로가 하나라도 있으면 나머지 방어가 전부 무의미해진다. 토큰이 만료·위조·손상
되면 예외를 삼키고 미인증으로 처리한다 — 실패 사유를 응답에 흘리지 않는다.

역할 넷:

| 역할 | 무엇을 하나 |
|:---|:---|
| `investor` | 청약 · 보유 조회 · 회수금 수령 |
| `operator` | 증빙 제출 · 집행 수령 · 매장 운영 |
| `landlord` | 공간 등록 · 계약 |
| `admin` | 심사 · 승인 · 발행 콘솔 · 대사 · 권한 |

`requireRole(role)`은 미인증이면 401, 역할 불일치면 403을 **Response 객체로 던진다**. 라우트는
그대로 되던지면 된다. `admin`은 모든 역할을 통과한다 — 심사와 운영 지원이 전 역할의 화면을 봐야
하기 때문이고, 그 대가로 admin의 모든 동작이 §8.7의 감사 로그에 남는다.

**미들웨어는 권한을 보지 않는다.** `middleware.ts`가 하는 일은 없어진 경로를 지금 경로로 보내는
것뿐이다(`/wallet` → `/verify/account`, `/portfolio` → `/investor/holdings` 등). 권한 판정을
미들웨어에 두면 라우트 핸들러가 "누가 여기 도달했는지" 모른 채 동작하고, 매칭 규칙 하나를
빠뜨리면 그 경로가 통째로 열린다. **판정은 그 판정을 쓰는 곳에서 한다.**

---

## 5. 모바일 신분증 인증

증권을 파는 이상 "누가 샀는지"를 확실히 알아야 한다. 이름·전화번호 입력으로는 성립하지 않는다.
**국가 발행 모바일 신분증에서 검증된 클레임을 받는다.**

### 5.1 두 경로

| 경로 | 무엇 | 모듈 |
|:---|:---|:---|
| OmniOne CX (라온시큐어) | 모바일 운전면허증 제출·파싱. 해커톤 제공 테스트 환경 | `lib/identity/oacx.ts` |
| OpenDID Verifier (KOMSCO K-DID / OmniOne) | 자체 호스팅 Verifier에 VP 제출·검증 | `lib/identity/verifier.ts` |

두 경로가 같은 인터페이스 `IdentityVerifier`를 구현한다.

```ts
createOffer(policy: { claims: string[] })  →  { txId, qrData, deeplink }
getStatus(txId)                            →  pending | submitted | verified | failed
getClaims(txId)                            →  IdentityClaims | null
```

`IDENTITY_PROVIDER` 환경변수가 구현체를 고른다. 개발·시연용 `StubVerifier`는 `createOffer`가
`IdentityVerification` 행을 만들고 `getStatus`가 3초 뒤 `pending → verified`로 자동 전이한다.
**어느 구현이든 도메인 코드는 같은 세 메서드만 부른다.**

### 5.2 OACX 4단계 흐름

```
① POST /oacx/api/v1.0/trans              거래 토큰 발급 (JWT 유효 5분)
② POST .../authen/{qr|app}/request       QR base64 또는 딥링크 발급
③ POST .../authen/{qr|app}/result        사용자 제출 완료 후 검증 요청
④ GET  .../trans/{token}                 토큰 파싱 — 여기서만 개인정보가 나온다
```

`qr` 모드는 PC 웹에서 폰으로 스캔하고, `app` 모드는 모바일에서 신분증 앱을 딥링크로 직접 호출한다
(`WEB2APP` / `APP2APP`).

**네 호출 전부 서버에서만 한다.** 결과 토큰이 브라우저에 노출되면 그 토큰으로 누구나 개인정보를
파싱할 수 있다 — 파싱 API에 별도 인증이 없다. 이건 편의 문제가 아니라 이 연동의 핵심 제약이다.

현재 활성 provider는 모바일 운전면허증(`comdl_v1.5`)뿐이다. 주민등록증(`comrc`)은 테스트 환경에서
꺼져 있어 기본값으로 두지 않는다.

### 5.3 영지식 모드 — 받을 수 있는 걸 받지 않는다

`zkpType`을 주면 원본 값 대신 판정만 받는다.

| `zkpType` | 받는 것 | 안 받는 것 |
|:---|:---|:---|
| `AdultVerify` | 성인 여부 `true/false` | 생년월일 |
| `GenderVerify` | 성별 판정 | 주민번호·생년월일 |

투자 적격 판정에 필요한 것은 "만 18세 이상인가"뿐이고 생년월일 자체가 아니다. **받을 수 있다고
받으면 그 값이 유출 대상이 된다.** 신분증 연동에서 영지식을 쓸 수 있는 자리가 정확히 여기다.

### 5.4 CI를 원문으로 저장하지 않는다

CI(연계정보)는 전 서비스 공통 식별자다. 원문을 보관하면 유출 시 타 서비스 계정까지 연결된다.
중복가입 판별에는 **동일성만** 필요하므로 서버 시크릿을 섞어 해시한다.

```
hashCi(ci) = sha256(`${IDENTITY_CI_SALT}:${ci}`)
```

`IDENTITY_CI_SALT`가 없으면 던진다 — 시크릿 없는 해시는 무지개표 한 번에 뚫린다.
생년월일도 같은 이유로 저장하지 않고 `ageFromBirth()`로 만 나이를 계산해 성인 여부만 남긴다.

### 5.5 검증된 클레임 → 투자 적격·연간한도

`lib/identity/investor-limit.ts`가 클레임을 받아 판정한다.

| 요건 | 규칙 |
|:---|:---|
| 실명 | `realName` 필수. 없으면 부적격 |
| 연령 | `adult === true` 또는 계산 나이 ≥ 18. 미달·불명이면 부적격 |
| 한도 | 통과 시 일반투자자 연간 한도 부여 |

판정 결과에는 `reasons` 배열이 함께 나온다 — 화면이 "왜 안 되는지"를 그대로 보여주기 위해서다.
**한도 수치는 확정값이 아니다.** 자본시장법과 온라인소액투자중개 시행령의 투자자별 한도를 따라야
하고, 실 서비스 전 법무 검토 후 상수를 확정한다. 코드에 그렇게 표시해 뒀다.

### 5.6 신원과 체인의 연결

검증을 통과하면 서버가 `FarmToken.registerIdentity(wallet, didHash)`를 호출해 **지갑과 DID 해시를
온체인에 바인딩**한다. 이게 §9.3의 양도제한이 성립하는 근거다. 익명 지갑을 실명 신원과 연결하지
않으면 증권 보유자 식별이 불가능하다.

---

## 6. 데이터 계층

PostgreSQL(Supabase) 하나에 모델 47개. 웹과 앱이 같은 DB를 본다.

**스키마가 웹·앱의 계약이다.** `prisma/schema.prisma`는 양쪽 담당이 함께 쓴다. 필드 하나를 고치면
두 앱이 동시에 영향받으므로, 스키마 변경은 화면 변경과 다른 커밋 단위로 다룬다.

**Prisma 7은 driver adapter를 요구한다.** `new PrismaClient()` 무인자는 동작하지 않고 `PrismaPg`를
주입해야 한다. datasource URL은 스키마가 아니라 `prisma.config.ts`에 있다. 생성된 클라이언트는
`src/generated/prisma`로 나온다(`node_modules`가 아니다).

연결 경로가 둘이고, 이걸 섞으면 마이그레이션이 조용히 실패한다.

| 작업 | 포트 | 이유 |
|:---|:---|:---|
| 시드 · 일반 쿼리 (DML) | 6543 (트랜잭션 pooler) | 서버리스에서 연결을 아낀다 |
| `db push` (DDL) | 5432 (세션 pooler) | 트랜잭션 pooler는 DDL을 넘기지 못한다 |

DDL은 `--url`로 5432를 덮어써야 한다. 무료 플랜이 일시정지되면 Supabase에서 Restore가 필요하다.

모델을 성격으로 묶으면 이렇다.

| 묶음 | 모델 |
|:---|:---|
| 신원·권한 | `User` · `IdentityVerification` · `CustodyWallet` · `BankAccount` |
| 공간·프로젝트 | `Space` · `Project` · `Institution` · `ProjectPartner` |
| 운영자 온보딩 | `OperatorApplication` · `OperatorVisit` · `OperatorCourse` · `OperatorCourseProgress` · `OperatorContract` |
| 자금 | `Investment` · `VirtualAccount` · `DepositEvent` · `Escrow` · `Transaction` · `Payout` |
| 집행 게이트 | `Milestone` · `Appeal` · `AppealComment` · `AuditLog` · `SettlementRule` |
| 발행·대사 | `HoldingIssuance` · `TokenHolding` · `ReconciliationEntry` · `NavSnapshot` · `Dividend` · `DividendClaim` |
| 운영·IoT | `IotData` · `Device` · `DeviceCommand` · `SensorThreshold` · `HarvestRecord` · `SalesRecord` |
| 재고·판매 | `Product` · `Inventory` · `StockAdjustment` · `Subscription` · `PickupOrder` |
| 계약·동의 | `Agreement` · `AgreementConsent` |
| 캐시·알림 | `AiCache` · `DemoCache` · `Notification` · `NotificationPref` |

**기간 조회는 `lib/data-window.ts`를 거친다.** 시드는 실행 시점 기준 상대 날짜로 데이터를 넣는데
조회는 현재 시각에서 역산한 창을 쓴다. 시드 후 창 길이보다 오래 지나면 두 구간이 겹치지 않아
결과가 0건이 되고, API는 200을 반환하는데 화면만 비어 **데이터가 없는 건지 기능이 없는 건지
구분되지 않는다.** 최신 레코드를 창의 끝점으로 삼고 화면에 "데이터 기준일"을 표기한다.

---

## 7. 자금 경로 — 청약에서 발행까지

### 7.1 투자 신청 상태 기계

```
DRAFT → IDENTITY_REQUIRED → ELIGIBILITY_CHECKED → CONSENT_REQUIRED
      → AWAITING_DEPOSIT → DEPOSIT_CONFIRMED → COMPLETED
                         ↘ DEPOSIT_FAILED
                         ↘ CANCELLED
```

화면 I-02(적합성) → I-03(최종확인·서명·납입) → I-04(완료)가 이 순서를 그대로 민다.
각 상태 전이에 전제가 하나씩 붙는다 — 신원 검증 없이 적격 판정으로 못 가고, 동의 없이 가상계좌를
받지 못하고, 입금 확인 없이 청약이 확정되지 않는다.

### 7.2 동의 문서 — 문서를 고쳐 쓰지 않는다

**본문을 바꾸려면 `version`을 올려 새 행을 만든다.** 옛 행은 `isActive = false`로 두되 지우지 않는다.
이미 동의한 사람이 본 문장이 나중에 바뀌면 "무엇에 동의했는지"를 증명할 수 없기 때문이다.

동의 기록(`AgreementConsent`)에는 **문서 해시를 복사해 둔다.** 문서 행을 잘못 건드려도 동의 시점의
본문이 무엇이었는지 남는다. 동의 시각·전자서명값·본인확인 세션을 함께 저장한다.

필수 문서를 모두 동의해야 `POST /api/investments/[id]/consent`가 통과하고, 그때 동의한 문서들을
묶은 해시를 `Investment.agreementHash`에 남긴다 — **체인에 올릴 계약 해시**다.

### 7.3 가상계좌와 입금 웹훅

동의를 마치면 건별 가상계좌를 발급하고 `AWAITING_DEPOSIT` + 입금기한을 건다.
은행 입금이 확인돼야 청약이 반영된다.

**멱등성은 `DepositEvent.providerTransactionId` unique로 잡는다.** 같은 거래번호는 웹훅이 몇 번
와도 한 번만 처리된다. 웹훅 서명은 HMAC + `timingSafeEqual`로 검증한다 — 일반 문자열 비교는
타이밍 공격에 노출된다.

실패 분기 넷을 화면에서 구분한다.

| 분기 | 처리 |
|:---|:---|
| 발급 실패 | 재시도 안내 |
| 입금기한 만료 | `DEPOSIT_FAILED`로 닫고 재신청 경로 |
| 금액 불일치 | `AMOUNT_MISMATCH` → 관리자 큐 |
| 확인 지연 | `POST .../deposit-inquiry`로 조회 요청 |

### 7.4 투자금 분리보관

투자금은 팜피 고유계정과 분리해 **신탁**으로 보관한다. 인가·계약 사항이라 출시 전 게이트에서
확정되고, 그때까지는 `FundCustodyAdapter` 뒤의 Mock이다.

**화면에 지금 어느 단계인지 그대로 적는다** — "분리보관 · 출시 시 신탁 적용". Mock을 실물처럼
보이게 하면 데모는 매끄럽지만 그 화면이 그대로 거짓말이 된다.

**용어를 정확히 쓴다.** 투자금 보관을 "에스크로"라고 부르지 않는다. 도산 격리는 신탁의 역할이고,
조건 충족 시 집행은 마일스톤 게이트의 역할이다. 둘 다 에스크로가 아니다. 온체인 `Escrow.sol`은
집행 게이트를 가리키는 이름이지 보관 주체가 아니다.

### 7.5 회수금 재원 — 워터폴

투자자 회수금은 운영자 매출에서 나오지 않는다. **FarmFi 플랫폼 수수료 풀에서 나온다.**
운영자는 매출 100%를 소유하고 이용료를 지불한다.

| 수수료 원천 | 처리 |
|:---|:---|
| 플랫폼 이용료 (월/사이트) | 풀에 포함 |
| 체험프로그램 중개 수수료 | 풀에 포함 |
| B2B 신규계약 성사 수수료 | 풀에 포함 (FarmFi가 성사시킨 증분 매출에만) |
| 온보딩피 (1회성/사이트) | **풀에서 제외** — 라운드 셋업 대가로 본체 귀속 |

풀의 60%가 분기 변동 회수금, 40%가 FarmFi 운영이다. `lib/waterfall.ts`가 이 산식의 정본이고,
기획안의 어느 절을 따랐는지까지 코드 주석에 남겨 뒀다. **운영자 주머니를 건드리지 않는 구조**가
이 제품의 전제라, 재원 산식이 흔들리면 전제가 흔들린다.

지급 사무(`lib/payout.ts`)는 산출과 분리한다. 지급 예정 건을 등록하고 상태(예정/완료/실패)와
증빙만 관리하며, 실제 계좌이체는 하지 않는다.

---

## 8. 집행 게이트 — 이 제품의 중심

자금이 나가는 경로는 하나뿐이고, 그 앞에 관문 셋을 둔다.

### 8.1 마일스톤 상태 기계

```
pending ─┬─→ evidence_submitted ─→ verified ─→ completed
in_progress                ↑           │
         revision_required ┴───────────┘
                           manual_review
                           failed
```

| 상태 | 화면 표기 | 뜻 |
|:---|:---|:---|
| `pending` | 예정 | 아직 시작 안 함 |
| `in_progress` | 진행중 | 직전 단계가 집행되어 열린 단계 |
| `evidence_submitted` | 증빙 제출됨 | 판정 대기 |
| `manual_review` | 보류 | 자동 판정 불가 — 사람이 본다 |
| `revision_required` | 보완 요청 | 증빙 재제출 필요 |
| `verified` | 통과 | 집행 가능 |
| `completed` | 집행 완료 | 자금이 나갔다 |
| `failed` | 실패 | 마감 |

**자금은 `verified`에서만 나간다.** `verified`에 이르는 길은 둘뿐이다 — 운영자 증빙에 대한 AI 검증
통과, 또는 관리자 승인(A-08). 둘 다 **증빙 제출이 전제**다. 증빙 없이 집행되는 구간을 하나라도
남기면 "조건 충족 시에만 집행"이라는 이 제품의 근거가 사라진다.

`manual_review`를 따로 둔 이유는 자동 실패와 판정 불가를 구분하기 위해서다. 센서가 결측이거나
설비가 무응답이면 그건 "조건 미충족"이 아니라 "판정할 수 없음"이다. 자동 반려로 처리하면 운영자가
자기 잘못이 아닌 일로 집행을 못 받는다.

### 8.2 AI 검증 파이프라인

`POST /api/milestones/[id]/verify`가 마일스톤의 `requiredSignals`를 순회하며 신호별로 판정한다.

| 신호 | 호출 | 무엇을 보나 |
|:---|:---|:---|
| `contract` | `/api/ai/verify-contract` | 공간사용 협약서 — 당사자·기간·주소 |
| `receipt` | `/api/ai/verify-receipt` | 설비 영수증 — 구매 항목·금액 |
| `photo` | `/api/ai/verify-photo` | 현장 사진 — 검출 객체 |
| `iot` | `/api/ai/detect-anomaly` | 센서 스트림 — 설비가 실제로 도는가 |

**교차검증이 이 파이프라인의 핵심이다.** 영수증의 구매 항목과 사진의 검출 객체가 **같은 설비
카테고리를 하나 이상 공유**하는지 확인한다. 카테고리는 조명(led/light/lamp) · 센서 · 재배설비
(선반/베드/rack) · 관수(펌프/양액/irrigation) 넷이다.

영수증만 보면 "샀다"까지고, 사진만 보면 "있다"까지다. 둘을 교차하면 **"산 것이 거기 있다"**가 된다.
영수증 사진과 무관한 매장 사진을 붙이는 가장 단순한 위조가 여기서 걸린다.

**검증 라우트는 admin 전용이다.** 신탁 자금 집행으로 이어지는 경로인데 `Project`에 소유자 필드가
없어 "내 프로젝트만"을 강제할 수 없다. 누구나 스스로 operator가 되어 남의 프로젝트를 집행하는
권한 자가상승을 admin 게이트로 차단한다.

**내부 self-fetch에도 자격증명을 전달한다.** `/api/ai/*`에도 인증 게이트가 걸려 있어 호출자의
`Authorization` 헤더 또는 쿠키를 그대로 넘긴다. base URL은 `NEXT_PUBLIC_BASE_URL`이 아니라
**현재 요청의 origin**을 쓴다 — `NEXT_PUBLIC_*`은 빌드 타임에 인라인되므로 로컬 `.env`의
`localhost:3000`이 프로덕션 번들에 구워질 수 있다.

### 8.3 서버 게이트 — `lib/milestone-gate.ts`

`canRunVerification()`은 검증을 돌릴 수 있는지 본다. 증빙이 없으면 판정할 대상이 없고, **검증 신호가
하나도 정의되지 않은 단계는 `every`가 공허참으로 통과**하므로 막는다.

`canRelease()`는 자금이 나가는 마지막 관문이라 상태값 하나만 믿지 않는다.

| 확인 항목 | 없으면 |
|:---|:---|
| `status === "verified"` | "증빙이 승인된 단계만 집행할 수 있습니다" |
| `evidenceSubmittedAt` | "운영자 증빙이 없는 단계는 집행할 수 없습니다" |
| `reviewedAt` 또는 `aiVerificationResult` | "증빙 판정 기록이 없습니다" |

세 번째가 중요하다. **상태만 `verified`인 행은 통과시키지 않는다** — 수동 조작이나 마이그레이션
잔재로 그런 행이 생길 수 있고, 그 하나가 통과하면 게이트가 아무것도 막지 못한다.

`canReview()`가 `verified`도 포함하는 이유는 반대 방향이다. 증빙 없이 verified가 된 옛 데이터를
보완 요청으로 되돌릴 길이 없으면 그 단계는 영영 집행도 회수도 못 하는 상태로 남는다.

### 8.4 온체인 게이트 — `Escrow.sol`

같은 조건을 컨트랙트가 다시 건다.

```solidity
function releaseTranche(uint256 seq) external nonReentrant {
    require(!projectFailed, "Project failed");
    require(seq == currentMilestone, "Wrong sequence");      // 순서를 건너뛸 수 없다
    require(milestones[seq].verified, "Not verified");       // 검증 없이는 못 나간다
    require(!milestones[seq].released, "Already released");  // 두 번 못 받는다
    require(roundGate == address(0) || IRoundGate(roundGate).isOpen(address(this)),
            "Round gate closed");
    ...
}
```

**두 겹을 두는 이유가 이것이다.** 서버 게이트는 우리가 고칠 수 있지만 컨트랙트는 배포 후 우리도
못 고친다. 투자자가 서버를 믿지 않아도 이 조건은 믿을 수 있다.

`verifyMilestone(seq, passed)`은 `VERIFIER_ROLE`만 부를 수 있고, 서버 지갑이 그 역할을 갖는다.
검증과 집행이 분리돼 있어 "검증은 했는데 집행은 안 한" 상태가 온체인에 그대로 보인다.

### 8.5 이의제기

AI 오판정이 최종 판정이 되지 않게 하는 경로다.

```
open(접수) → under_review(운영팀 검토) → escalated(외부 전문가) → approved / rejected
```

외부 전문가는 별도 계정 역할이 아니다(`Role`에 `auditor`가 없다). `escalated` 단계에서 운영팀이
전문가 의견을 `authorRole="auditor"` 코멘트로 대신 기록한다. 상태 전이표와 접근 범위를
`lib/appeal.ts` 한 곳에 둔다.

### 8.6 갇히지 않게 하는 탈출구

관문을 세게 걸수록 **자금이 영영 못 나가는 상태**가 위험해진다. 셋을 둔다.

| 장치 | 무엇을 막나 |
|:---|:---|
| `MILESTONE_TIMEOUT = 180 days` | 운영사가 실패 선언을 미뤄 자금이 동결되는 것 |
| `triggerTimeoutFailure()` — 누구나 호출 | admin 선의에 의존하는 구조 |
| `refund()` — 지분 비례 | 실패한 프로젝트의 투자금이 남는 것 |

타임아웃 실패는 **투자자를 포함해 누구나** 트리거할 수 있다. admin만 실패를 선언할 수 있으면
admin이 사라진 프로젝트의 투자금은 회수 경로가 없다. 단, 완주한 프로젝트에는 적용되지 않는다
(`currentMilestone <= milestoneCount` 요구).

환불은 `refundAmount = invested × remaining / totalLocked`. 이미 집행된 몫은 빠진 채로 남은
잔액을 지분대로 나눈다.

타임아웃 상수는 컨트랙트와 서버 양쪽에 있다. `lib/onchain.ts`의 `MILESTONE_TIMEOUT_DAYS = 180`이
DB `deadlineAt` 계산의 단일 출처이고, **컨트랙트를 바꾸면 여기도 같이 바꿔야 한다**고 주석에 못박았다.

### 8.7 감사 로그

청약·검증·집행·정산·권한 변경이 `AuditLog`에 남는다. 설계 결정 둘.

**① 감사 기록 실패가 본 작업을 깨뜨리지 않는다.** 로그 쓰기에서 난 예외가 트랜치 집행을
롤백시키면 안 된다 — 기록보다 거래가 우선이다.

**② 단, 트랜잭션 안에서 남길 때는 예외를 삼키지 않는다.** 트랜잭션 클라이언트를 받는 경로에서
예외를 삼키면 롤백 상태가 꼬인다. 같은 함수가 두 모드를 처리하되 예외 정책이 반대다.

감사 항목 목록이 곧 화면 필터의 선택지다. **기록에 없으면 조회할 수도 없다** — "기록에 없으면
일어나지 않은 일"이 되게 하려는 것이다.

---

## 9. 블록체인 계층

### 9.1 체인 선택과 설정

체인은 하드코딩하지 않고 환경변수로 정한다.

| 변수 | 뜻 |
|:---|:---|
| `ONCHAIN_CHAIN_ID` · `ONCHAIN_RPC_URL` · `ONCHAIN_NAME` | 체인 지정 |
| `ONCHAIN_GAS_ZERO` | `true`면 legacy 트랜잭션 + `gasPrice = 0` |
| `ONCHAIN_ESCROW_ADDRESS` · `ONCHAIN_FARM_TOKEN_ADDRESS` | 컨트랙트 주소 |
| `ONCHAIN_PRIVATE_KEY` | 서버 지갑 (배포자 = VERIFIER = MINTER) |

미설정이면 Polygon Amoy(80002)로 폴백한다. OmniOne Chain(201210)은 가스가 0이라 `GAS_ZERO=true`로
두면 `gasPrice: 0` legacy 트랜잭션으로 보낸다. 기존 `ESCROW_ADDRESS`/`PRIVATE_KEY`는 Amoy 배포분
폴백으로 남겨 둬, `ONCHAIN_*`를 비우면 즉시 Amoy로 되돌아간다.

**RPC URL은 서버 전용이다.** `NEXT_PUBLIC_` 접두사를 붙이지 않아 URL에 든 비밀 토큰이 클라이언트로
나가지 않는다. `lib/onchain.ts`는 API 라우트에서만 쓰인다.

주소나 키가 없으면 `isOnchainEnabled()`가 false를 반환하고 체인 호출이 `null`을 낸다 —
**배포 전에도 나머지 흐름이 그대로 돈다.**

### 9.2 `Escrow.sol` — 마일스톤 집행

`ReentrancyGuard` + `AccessControl`. 상태는 `totalLocked` · `totalReleased` · `remaining`.

**생성자에서 마일스톤 이름과 비율을 못박는다.** 비율은 basis point(3500 = 35%)이고
`require(totalPct == 10000)`으로 합이 100%임을 강제한다. 나중에 비율을 바꿀 함수가 없다 —
**투자 후에 집행 비율이 바뀌면 투자 판단의 근거가 사라진다.**

| 함수 | 권한 | 하는 일 |
|:---|:---|:---|
| `subscribe()` | 누구나 (payable) | 청약. 토큰 발행 + 마일스톤별 집행액 재계산 |
| `verifyMilestone(seq, passed)` | `VERIFIER_ROLE` | 검증 결과 기록 |
| `releaseTranche(seq)` | 누구나 | 조건 통과 시 운영자에게 전송 |
| `markFailed()` | `DEFAULT_ADMIN_ROLE` | 실패 선언 |
| `triggerTimeoutFailure()` | 누구나 | 마감 경과 시 실패 전환 |
| `setRoundGate(gate)` | `DEFAULT_ADMIN_ROLE` | 게이트 설정 (첫 집행 전 1회만) |
| `refund()` | 투자자 | 지분 비례 환불 |

`subscribe()`는 `msg.value % tokenPrice == 0`을 요구한다. 토큰 단위로만 살 수 있고 잔돈이 남지
않는다. 청약이 들어올 때마다 `releaseAmount = totalLocked × releasePct / 10000`을 다시 계산한다 —
모집액이 확정되기 전에는 각 단계의 집행액도 확정되지 않기 때문이다.

`releaseTranche`는 **권한 제한이 없다.** 누구나 부를 수 있지만 조건이 전부 충족돼야 통과하고,
자금은 언제나 생성자에 못박힌 `operator` 주소로만 간다. 권한을 걸면 그 권한자가 사라졌을 때
검증을 통과한 자금이 묶인다.

`setRoundGate`는 `currentMilestone == 1 && !milestones[1].released`를 요구한다 — **자금이 움직이기
시작한 뒤에 게이트를 끼워 넣을 수 없다.**

### 9.3 `FarmToken.sol` — 보유 구좌

ERC-20이지만 **`decimals()`가 0**이다. 1구좌 = 정수 1. 증권 지분에 소수점이 없어야 하고,
이 결정 덕분에 명세의 `HoldingLedger`를 새로 배포하지 않고 `FarmToken.mint`가 그 역할을 한다.

**양도제한 — 화이트리스트.**

```solidity
function _update(address from, address to, uint256 value) internal override {
    if (from != address(0) && to != address(0)) {
        require(isVerified(from) && isVerified(to), "FarmToken: holder not verified");
    }
    ...
}
```

2차 이전(P2P)은 송·수신 지갑이 **모두** 신원 등록돼 있어야 한다. `from == address(0)`인 발행은
예외다 — 청약 발행은 신원 게이트 밖에 둬야 신원 등록 전에도 구좌가 나간다.

**1지갑 = 1신원, 1신원 = 1지갑.** `identity[wallet] → didHash`와 `didToWallet[didHash] → wallet`
양방향 매핑을 둬, 한 사람이 지갑을 여러 개 만들어 양도제한을 우회하는 것을 막는다. 재바인딩은
`revokeIdentity` 후 재등록만 가능하다.

**블록 단위 잔고 체크포인트.** `Checkpoints.Trace208`로 모든 mint/burn/transfer 후 잔고와
총공급을 기록한다. `balanceOfAt(account, blockNumber)` · `totalSupplyAt(blockNumber)`로
과거 시점 잔고를 조회한다. 이게 §9.4의 배당 스냅샷 근거다.

**남은 프라이버시 문제.** `identity` 매핑이 public이라 "지갑↔DID 해시" 연결이 온체인에 노출된다.
해시라 원문은 아니지만 링크빌리티는 남는다. 실서비스 전 검토가 필요하고, 코드에 그렇게 표시해 뒀다.

### 9.4 `Dividend.sol` — 스냅샷 기준 분배

회차마다 `snapshotBlock = block.number`를 기록하고, 청구 시 **그 블록 시점의 잔고**로 계산한다.

```solidity
uint256 balance = farmToken.balanceOfAt(msg.sender, rounds[round].snapshotBlock);
uint256 amount = balance * rounds[round].perToken;
```

스냅샷이 없으면 **배당 발표 후 토큰을 산 사람이 그 배당을 청구**한다. 발표 → 매수 → 청구 →
매도로 무위험 차익을 낼 수 있고, 기존 보유자의 몫이 희석된다. 체크포인트가 이 취약점을 막는다.

`claimed[round][msg.sender]`로 회차별 1회만 청구되고, `nonReentrant`가 걸린다.

### 9.5 `RoundGate.sol` — 파일럿 실증 게이트

파일럿 1호점이 전 마일스톤을 통과해야 나머지 사이트의 집행이 열린다.

```solidity
function pilotCompleted() public view returns (bool) {
    return !p.projectFailed() && p.currentMilestone() > p.milestoneCount();
}
function isOpen(address site) external view returns (bool) {
    return site == pilot || pilotCompleted();
}
```

파일럿 자신은 항상 열려 있다. **청약(모집)은 게이트와 무관하게 진행되고**, 파일럿이 실패하면
나머지 사이트 투자금은 미집행 상태 그대로 환불 경로를 탄다. 검증 안 된 모델을 여러 매장으로
동시에 퍼뜨리지 않기 위한 장치다. `setPilot`도 1회만 가능하다.

### 9.6 투자자 수탁 지갑

투자자는 주소·개인키·가스비를 다루지 않는다. 서버가 1인 1지갑(`CustodyWallet.userId` unique)을
만들어 보관한다.

개인키는 **AES-256-GCM**으로 암호화하고 **DB에는 `keyRef` 하나만** 든다. 그 값만으로는 키를
복원할 수 없고 마스터 키(`CUSTODY_MASTER_KEY`, 32바이트 hex)가 따로 있어야 한다.
**마스터 키가 없으면 지갑을 만들지 않는다** — 평문 저장으로 물러서는 경로를 두지 않는다.
운영에서는 KMS/HSM으로 바뀌고, 그때도 DB에 드는 것은 `keyRef`뿐이다.

지갑 주소는 admin 응답에만 싣고 투자자 화면에는 내보내지 않는다.

**OpenDID의 Wallet SDK와 다른 층이다.** 그쪽은 신원·VC 보관용이고 이쪽은 증권 보유용이다.
이름이 같아도 섞지 않는다.

### 9.7 Chain Relay — 트랜잭셔널 아웃박스

DB 커밋과 체인 전송은 한 트랜잭션에 묶을 수 없다. 그래서 "발행하기로 했다"는 사실을 먼저
커밋하고, 전송은 재시도로 따라붙게 한다.

```
은행 입금 확인 ──같은 트랜잭션── HoldingIssuance(PENDING) 기록
                                       │
                             Chain Relay가 그 행을 집어 mint 전송
                                       │
                                SENT(해시) → CONFIRMED
```

`eventId = deposit:<거래번호>:mint`가 unique다. **웹훅이 몇 번 오든 발행 행은 하나**다.
중간에 프로세스가 죽어도 PENDING 행이 남아 이어서 처리된다.

실패는 지수 백오프 5회(30초 · 1분 · 2분 · 4분 · 8분) 후 `CHAIN_FAILED` + 운영 알림.
**체인이 실패해도 입금과 청약은 되돌리지 않는다.** 돈은 이미 들어왔고, 체인 기록은 그 사실의
사본이지 원본이 아니다. 반대로 청약이 `DEPOSIT_FAILED`로 끝난 건은 발행을 `CANCELLED`로 닫는다 —
환불 대상에 구좌를 발행하지 않는다.

**Relay가 체인 전송의 유일한 통로다.** 보유 구좌 발행·이전은 전부 운영키 트랜잭션이고, 투자자
개인키 서명은 발생하지 않는다. 프론트엔드는 이 경로를 부를 수 없다 — 서버 모듈로만 쓴다.

발행 콘솔은 `GET/POST /api/admin/issuances`. `id`를 주면 그 건만 재시도(`CHAIN_FAILED`도 되살린다),
안 주면 전체 드레인. **잡 큐를 따로 두지 않았다** — 발행 행이 곧 큐다.

### 9.8 대사 — 불일치를 고치지 않는다

`lib/reconciliation.ts`가 DB의 보유 구좌와 체인 잔액을 맞춰본다.

**① 영수증 재조회 (`sweepReceipts`).** 전송은 했는데(SENT + 해시) 결과를 못 받은 건을 체인에
다시 묻는다. Relay는 "해시가 있으면 성공"으로 넘기지만 여기서는 영수증을 실제로 확인해 **되돌려진
트랜잭션을 잡는다.** revert면 해시를 지운다 — 지우지 않으면 Relay가 실패를 성공으로 오인한다.

**② 건수 대조 (`reconcileHoldings`).** 지갑별 DB 확정 구좌 합과 `balanceOf`를 비교한다.

**불일치는 자동으로 고치지 않는다.** 어느 쪽이 맞는지 기계가 판단할 수 없고, 잘못 맞추면 구좌가
이중으로 생기거나 사라진다. `ReconciliationEntry`(OPEN·RESOLVED)에 적어 사람에게 넘기고,
해소에는 사유를 필수로 받는다.

스케줄은 `/api/cron/reconcile`(`CRON_SECRET` 필요) — 영수증 10분 주기, 전체 대사 하루 한 번.

### 9.9 컨트랙트 테스트

Foundry로 다섯 묶음을 고정한다.

| 파일 | 무엇 |
|:---|:---|
| `Escrow.t.sol` | 청약 · 검증 · 집행 · 실패 · 환불 |
| `Escrow.invariant.t.sol` | 불변식 — `totalLocked = totalReleased + remaining` |
| `FarmToken.t.sol` | 발행 상한 · 화이트리스트 · 신원 바인딩 · 체크포인트 |
| `Dividend.t.sol` | 스냅샷 기준 분배 · 중복 청구 차단 |
| `V16Hardening.t.sol` | 하드닝 회귀 — 타임아웃 · 라운드게이트 · 게이트 설정 시점 |

불변식 테스트가 중요하다. 개별 함수가 전부 통과해도 **호출 순서 조합에서 잔액이 어긋나는** 경우를
단위 테스트로는 못 잡는다.

---

## 10. AI 계층 — 판단하지 않고 통역한다

AI가 두 자리에 있고, 둘 다 최종 판단자가 아니다.

### 10.1 증빙 검증 (Vision)

`lib/ai-vision.ts`가 이미지 + 프롬프트를 받아 JSON을 뽑는다. 키가 설정된 provider만
**Gemini → OpenAI → Anthropic** 순으로 시도한다. 라우트 코드를 고치지 않고 키만 채우면
폴백 체인에 합류한다. 현재는 무료 Gemini(`gemini-2.5-flash`)만 쓴다.

**캐시 키에 이미지 지문이 들어간다.**

```
cacheKey = `${signalType}:${sha256(imageBase64).slice(0, 16)}`
```

마일스톤 ID만으로 키를 만들면 같은 마일스톤에 아무 이미지나 올려도 이전 통과 결과가 재사용된다 —
**위조 통과**가 된다. 캐시는 비용 절감 장치이지 판정 우회 장치가 아니다.

**AI 판정이 곧 집행이 아니다.** 자동 검증 실패는 자동 반려가 아니라 `manual_review` 큐로 간다.
판정 근거(신호별 초안·추출값·교차대조 결과·신뢰도)는 조회할 수 있고, 운영자는 이의제기할 수 있다.

### 10.2 운영 조언 (LLM 하네스)

`lib/llm-harness.ts`는 Tool-use ReAct 오케스트레이터다. **LLM이 정하는 것은 "어느 알고리즘을
부를까"까지고, 계산은 결정론적 함수가 한다.**

| LLM이 고를 수 있는 도구 | 실제 계산 |
|:---|:---|
| `maintenanceRisk` | 센서 드리프트 기반 예지보전 |
| `dliSchedule` | TOU 요금 연동 광주기 스케줄 |
| `cusumDrift` | MAD-CUSUM 관리도 |
| `holtWintersForecast` | 수요 예측 |
| `seedingPlan` | 파종량 계획 |
| `analyzeGrowthRecipe` | 생육 레시피 |

API 키가 없으면 규칙 기반 목업이 같은 인터페이스로 답한다. SDK 의존 없이 fetch REST만 쓴다.

**이렇게 가른 이유.** LLM이 숫자를 직접 내면 그 숫자가 어디서 왔는지 아무도 답할 수 없고
재현되지도 않는다. 운영 판단과 정산에 그런 숫자를 쓸 수 없다.

---

## 11. 운영·학습 계층의 경계

계산 내용은 두 근거 문서가 담당한다. 여기서는 **경계를 어디에 그었는지**만 적는다.

| 계층 | 질문 | 어디에 |
|:---|:---|:---|
| 생육 레시피 | 환경 목표를 **무엇으로** 정하나 | `growth-recipe-rationale.md` |
| 운영최적화 | 그 목표를 **어떻게 싸게** 달성하나 | `optimization-rationale.md` |
| 자동제어 | 그 목표에 **실제로 도달**시키나 | `optimization-rationale.md` (제어·HIL 절) |

**두 층이 목적함수를 공유해야 한다.** 레시피가 수율만 최대화하면 비싼 목표를 정하고 스케줄 층이
그 비싼 목표를 싸게 달성하는 구조로 수렴한다 — 맞물린다는 말이 실제로는 성립하지 않는다.
그래서 레시피 층의 목적함수를 수익(매출 − 운전비)으로 두어 두 층이 같은 것을 최대화하게 한다.
이건 계산 선택이 아니라 층 경계를 정하는 결정이라 여기에 적는다.

**계산 계층은 DB·네트워크에 의존하지 않는다.** 순수 함수로 두어 API 라우트와 모바일 앱이
같은 함수를 공유한다. 파이프라인 조립도 한 곳(`optimization-report.ts`)에서 한다 — 웹 페이지와
API가 각자 계산하면 입력이 조금씩 갈라져 같은 프로젝트인데 다른 숫자가 나온다.

**데이터 원천은 어댑터 뒤에 둔다.** `lib/opendata.ts`가 스마트팜코리아 빅데이터 플랫폼(농정원)과
공공데이터포털 농진청 데이터셋의 스키마를 따르는 경계면이다. 실 데이터 전환은 `fetchOpenData()`의
fetch 부분만 교체하면 된다(`SMARTFARM_API_KEY`). 데이터셋별 필드 명칭 차이는 `mapRecord`가 흡수한다.

### 11.1 완성 시의 닫힌 루프

```
IoT 관측 → 학습 → 레시피·스케줄 산출 → 운영자가 적용 → 다음 사이클 수확 → 다시 학습
```

적용은 운영자가 누를 때만 하고, **산출값과 실제 적용값을 함께 남긴다.** 정산과 판정에는 적용값을
쓴다. 둘을 구분해 기록하지 않으면 "권고대로 했는데 결과가 나빴다"와 "권고를 안 따랐다"를 사후에
가를 수 없다.

---

## 12. 웹과 앱의 경계

| | 웹 (`frontend/`) | 앱 (`app/`) |
|:---|:---|:---|
| 누가 쓰나 | 투자자 · 건물주 · 구매자 · 관리자 | 운영자 |
| 무엇을 하나 | 청약 · 보유 조회 · 심사 · 정산 | 매장 운영 · 모니터링 · 픽업 · 증빙 |
| 스택 | Next.js 14 | Expo React Native |

**공유하는 것 셋.** 같은 서버, 같은 DB(`prisma/schema.prisma`), 같은 JWT.
접점(보증서 확인 · 설비 연결 · 픽업 스캔 · 증빙 제출)은 `app-feature-spec.md` 0.2 표가 정본이다.

**색도 공유한다.** 웹과 앱이 같은 팔레트를 쓴다.

```
ink #1A1A1A · body #4A4A4A · muted #8A8A8A
line #E5E5E3 · line-soft #EDEDEB · surface #F2F2F0
brand #14542E · brand-soft #EAF6EE · danger #A34A3D
```

**상태를 여러 색으로 등급 매기지 않는다. 글자로 말한다.** 색으로 심각도를 표현하면 색맹 사용자와
흑백 출력에서 정보가 사라지고, 무엇보다 "노랑이 경고인지 주의인지"를 아무도 합의하지 않는다.

---

## 13. 배포와 환경

| 항목 | 값 |
|:---|:---|
| 호스팅 | Vercel (Linux) |
| DB | Supabase PostgreSQL |
| 도커 | 쓰지 않음 |
| 배포 방식 | `frontend/`에서 `npx vercel --prod` |
| 스케줄 | `/api/cron/reconcile` (`CRON_SECRET` 헤더 검증) |

환경변수 묶음:

| 묶음 | 키 |
|:---|:---|
| DB | `DATABASE_URL` (6543) · DDL은 5432 오버라이드 |
| 인증 | `JWT_SECRET` |
| 신원 | `IDENTITY_PROVIDER` · `IDENTITY_VERIFIER_URL` · `IDENTITY_VERIFIER_POLICY_ID` · `IDENTITY_CI_SALT` · `OACX_BASE_URL` · `OACX_PROVIDER` |
| 체인 | `ONCHAIN_CHAIN_ID` · `ONCHAIN_RPC_URL` · `ONCHAIN_NAME` · `ONCHAIN_GAS_ZERO` · `ONCHAIN_ESCROW_ADDRESS` · `ONCHAIN_FARM_TOKEN_ADDRESS` · `ONCHAIN_PRIVATE_KEY` |
| 수탁 | `CUSTODY_MASTER_KEY` (32바이트 hex) |
| AI | `GEMINI_API_KEY` · `OPENAI_API_KEY` · `ANTHROPIC_API_KEY` |
| 배치 | `CRON_SECRET` |
| 데이터 | `SMARTFARM_API_KEY` |

**`NEXT_PUBLIC_` 접두사를 함부로 붙이지 않는다.** 빌드 타임에 번들로 인라인되므로 로컬 `.env`
값이 프로덕션에 구워진다. 실제로 `NEXT_PUBLIC_BASE_URL`에 `localhost:3000`이 박혀 self-fetch가
죽은 적이 있어, 지금은 요청 origin을 쓴다.

`DEMO_MODE=cached`를 두면 AI 호출 대신 `DemoCache`의 저장된 결과를 쓴다. 발표장 네트워크가
불안정하거나 외부 API가 흔들려도 시연이 멈추지 않게 하는 장치다.

---

## 14. 검증

| 대상 | 방법 |
|:---|:---|
| 타입 | `npx tsc --noEmit` |
| 도메인 로직 | `npm test` — `tsx --test "src/**/*.test.ts"` |
| 컨트랙트 | `forge test` |
| 렌더 | `npm run dev` → 라우트별로 `design/screens/`의 좌표·색·폰트 덤프와 대조 |
| 프로덕션 빌드 | Vercel 프리뷰 배포 |

`lib/` 테스트 7묶음이 최적화·학습 계층을 고정한다 — `optimization` · `optimization-advanced` ·
`growth-recipe` · `growth-recipe-advanced` · `growth-recipe-profit` · `crop-normalize` ·
`growth-monitoring`. 주장마다 **반대 방향 데이터를 넣어 값이 실제로 움직이는지** 확인한다.
"잡음이 5배인데 불확실성이 안 커졌다", "공짜인데 DLI가 움직였다" 같은 실패 메시지가 그 설계다.

**로컬에서 `next build`가 실패한다.** 한글 경로(`D:\해커톤`)에서 readlink EISDIR로 죽는다.
검증은 `tsc --noEmit` + `next dev`로 하고, 프로덕션 빌드는 Vercel(Linux)에서만 확인된다.

인수 기준은 `feature-spec.md` 18장의 역할별 테스트를 쓴다 — 중복 은행 웹훅이 와도 투자금 1회 반영,
같은 `eventId`로 재시도해도 보유 구좌 이중 발행 없음, 승인되지 않은 마일스톤은 집행 API가 거부.

---

## 15. 현재 구현 범위

§1~§14는 완성 시점을 기술한다. 현재와의 차이를 여기에 모은다. 정본은 `build-plan.md`의 체크박스다.

### 15.1 동작하는 것

화면 62개와 그 화면이 도는 최소 API(Phase A~K), 투자금 납입 실계(O), 체인 기록·보유 구좌 발행과
대사(P), 동의 문서(Q1)가 끝났다. 집행 게이트는 서버·온체인 양쪽 모두 동작하고, 모바일 신분증
인증은 프로덕션에 배포돼 실 Verifier와 연동된다. 학습 스택은 계산과 표시 화면이 동작한다.

### 15.2 남은 것

| 무엇 | 없으면 생기는 일 |
|:---|:---|
| 검증 근거 조회 · 심사 큐 · `manual_review` 라우팅 (T) | AI 판정 근거를 화면에서 볼 수 없다. 판정 불가와 반려가 갈리지 않는다 |
| 레시피·최적화 적용 경로 (W1·W2) | 학습값이 계산만 되고 운영에 닿지 않는다. 최적대 판정과 목표 DLI가 여전히 문헌값을 본다 |
| 레시피 관측의 실데이터 연결 (W1a) | 학습 입력이 합성 관측이다. §11.1의 루프가 열려 있다 |
| 운영자 보증서 모델 (Q3) | 앱이 운영 기능을 열고 닫을 기준이 없다 |
| 신청 단계 도메인 분리 (Q2) | 방문·교육·계약이 `OperatorApplication` PATCH 하나에 얹혀 있다 |
| 정산 입력·확정과 지급 실패 처리 (S) | 확정 전 값과 확정 값이 갈리지 않는다 |
| 픽업 바코드 발급 (R) | 회차 중복 수령을 발급 쪽에서 막지 못한다 |
| 계약 해시의 체인 전송 (Q1 잔여) | 배포된 컨트랙트에 `registerAgreement`에 해당하는 함수가 없다 |
| 디자인 최종본 반영 (N) | 지금까지 옮긴 화면은 잠정 `.fig` 기준이다 |

### 15.3 구조적 한계

**① 학습 스택은 실 수확 라벨이 0건이다.** 검증된 것은 "정답을 아는 합성 반응면에서 그 정답을
되찾는다"이지 "실제 재배에서 맞는 목표를 낸다"가 아니다. 상세는 `growth-recipe-rationale.md` §10.1.

**② 외부 사업자가 전부 Mock이다.** 은행·PG·신탁 실 API는 명세 17.3의 출시 전 게이트다.
Mock으로 흐름 전체가 도는 것까지가 지금 확인할 수 있는 최대치다.

**③ 모바일 신분증은 테스트 환경이다.** OACX는 해커톤 제공 환경이고, 자체 호스팅 Verifier는
홀더 지갑앱이 없어 실 QR이 자동으로 verified가 되지 않는다. 시연용 경로를 admin 게이트 뒤에 둔다.

**④ 투자 모집 기능은 법률 검토 전이다.** 실제 활성화는 금융 파트너 승인까지 feature flag로 막는다.
투자자 연간한도 수치도 법무 검토 후 확정한다.

**⑤ 온체인 신원 링크빌리티가 남는다.** `FarmToken.identity` 매핑이 public이라 지갑↔DID 해시
연결이 노출된다(§9.3).

**⑥ 로컬 프로덕션 빌드가 안 된다.** 한글 경로 EISDIR(§14).

**⑦ 웹과 앱이 같은 서버·같은 DB를 쓴다.** 웹 배포가 앱에 영향을 주고, 스키마 변경은 양쪽 담당이
합의해야 한다. 결함이 아니라 선택이지만(§2), 팀이 커지면 첫 번째로 아플 자리다.

---

## 16. 이 구조를 지탱하는 원칙 6개

**① 판정할 수 없으면 판정하지 않는다.** 센서 결측은 반려가 아니라 `manual_review`, 대사 불일치는
자동 수정이 아니라 사람에게, 표본이 모자란 설명력은 0이 아니라 `null`, 외기 데이터가 없으면
그 분석은 `unavailable`이다. **판정하지 않은 것이 "정상"으로 보이는 경로**가 가장 위험하다.

**② 규칙은 한 곳에만 둔다.** 게이트는 `milestone-gate.ts`, 체인 전송은 `chain-relay.ts`,
신원은 `auth.ts`, 좌표 변환은 `crop-normalize.ts`, 단가는 `optimization-params.ts`.
두 벌이 되는 순간 어느 쪽이 정본인지 코드가 말하지 못한다.

**③ 우리가 못 고치는 곳에 마지막 방어선을 둔다.** 서버 게이트는 우리가 고칠 수 있고 컨트랙트는
못 고친다. 그래서 같은 조건을 두 번 건다. 투자자가 우리를 믿지 않아도 성립하는 층이 하나는 있어야 한다.

**④ 없는 값을 지어내지 않는다.** Mock을 실물처럼 그리지 않고 화면에 단계를 적는다. 근거 없는
비용 항은 0으로 두고 표에 밝힌다. 내부값에서 상수를 빼 외기온도를 만들어 넣지 않는다.

**⑤ 받을 수 있어도 필요 없으면 받지 않는다.** 성인 여부만 필요하면 영지식으로 판정만 받고,
CI는 해시로만 남기고, 생년월일은 나이만 계산해 버린다. 보관하지 않은 값은 유출되지 않는다.

**⑥ 갇히는 상태를 만들지 않는다.** 관문을 세게 걸수록 탈출구가 필요하다 — 타임아웃 실패는
누구나 트리거하고, 이의제기 경로가 있고, 환불은 지분대로 자동 계산된다.

---

## 부록 A. 파일 지도

### 경계·인프라
| 파일 | 역할 |
|:---|:---|
| `lib/auth.ts` | 세션 서명·검증 · `requireRole` — 신원의 유일한 원천 |
| `lib/db.ts` | Prisma 클라이언트 (PrismaPg 어댑터 주입) |
| `lib/serialize.ts` | BigInt 직렬화 단일 지점 |
| `lib/query.ts` · `lib/data-window.ts` | 쿼리 헬퍼 · 기간 창 기준점 보정 |
| `middleware.ts` | 없어진 경로 → 지금 경로 (권한 판정 없음) |

### 신원
| 파일 | 역할 |
|:---|:---|
| `lib/identity/oacx.ts` | OmniOne CX 4단계 · ZKP 모드 · CI 해시 |
| `lib/identity/verifier.ts` | `IdentityVerifier` 추상화 · Stub · OpenDID 실연동 |
| `lib/identity/investor-limit.ts` | 투자 적격·연간한도 판정 |

### 자금
| 파일 | 역할 |
|:---|:---|
| `lib/investment.ts` | 투자 신청 상태 기계 |
| `lib/agreements.ts` | 동의 문서 버전·해시 |
| `lib/payment.ts` | 납입 어댑터 (가상계좌·입금조회·웹훅 서명) |
| `lib/deposit.ts` | 가상계좌 발급 · 입금 확인 · 청약 확정 |
| `lib/subscription.ts` | 청약 실행 (잔액·재고·한도 검증 → 트랜잭션) |
| `lib/fund-custody.ts` | 투자금 분리보관 어댑터 |
| `lib/waterfall.ts` | 수수료 풀 → 회수금 재원 산식 |
| `lib/payout.ts` · `lib/nav-calculator.ts` | 지급 원장 · NAV |

### 집행 게이트
| 파일 | 역할 |
|:---|:---|
| `lib/milestone-gate.ts` | 상태 기계 · `canRunVerification` · `canRelease` |
| `lib/appeal.ts` | 이의제기 상태 전이표 |
| `lib/audit.ts` | 감사 로그 — 두 예외 정책 |
| `api/milestones/[id]/verify` | AI 신호 4종 + 교차검증 |
| `api/milestones/[id]/approve` | 관리자 재검토 (approve / revise) |

### 체인
| 파일 | 역할 |
|:---|:---|
| `lib/onchain.ts` | viem 클라이언트 · env 기반 체인 선택 · 타임아웃 상수 미러 |
| `lib/chain-relay.ts` | 체인 전송의 유일한 통로 · 아웃박스 · 지수 백오프 |
| `lib/custody.ts` | 투자자 수탁 지갑 · AES-256-GCM 키스토어 |
| `lib/reconciliation.ts` | 영수증 재조회 · 건수 대조 · 불일치 기록 |
| `contracts/src/Escrow.sol` | 마일스톤 락·검증·집행 · 타임아웃 · 환불 |
| `contracts/src/FarmToken.sol` | 보유 구좌 (decimals 0) · 화이트리스트 · 잔고 체크포인트 |
| `contracts/src/Dividend.sol` | 스냅샷 기준 배당 분배 |
| `contracts/src/RoundGate.sol` | 파일럿 통과 전 후속 사이트 집행 차단 |

### AI · 최적화
| 파일 | 역할 |
|:---|:---|
| `lib/ai-vision.ts` · `lib/ai-cache.ts` | Vision 폴백 체인 · 이미지 지문 캐시 |
| `lib/llm-harness.ts` | Tool-use 오케스트레이터 |
| `lib/optimization*.ts` · `control-loop.ts` · `hil-sim.ts` · `iot-health.ts` · `growth-monitoring.ts` · `prng.ts` | 운영최적화·제어 — 파일 지도는 `optimization-rationale.md` 부록 A |
| `lib/growth-recipe*.ts` · `crop-*.ts` | 생육 레시피 — 파일 지도는 `growth-recipe-rationale.md` 부록 A |
| `lib/opendata.ts` | 공개데이터 경계면 (스마트팜코리아 · 공공데이터포털) |

### 화면
| 파일 | 역할 |
|:---|:---|
| `components/screens/api.ts` | 화면의 유일한 조회 통로 (React Query) |
| `components/screens/{investor,operator,landlord,buyer,admin,common}/` | 역할별 화면 |
| `components/ui/` | 공용 프리미티브 — Button · Card · Badge · DataTable · StepLine · ProgressBar |

---

## 부록 B. 한 줄 정리

```
스택        Next.js 14 App Router · Prisma 7(PrismaPg) · PostgreSQL(Supabase) · Vercel · 도커 없음
규모        화면 66 · API 92 · 도메인 모듈 65 · Prisma 모델 47 · 컨트랙트 4
앱          Expo React Native (app/) — 같은 서버 · 같은 DB · 같은 JWT · 같은 팔레트
인증        HS256 JWT · httpOnly 쿠키 + Bearer 폴백 · 7일 · requireRole(admin 통과) · 신원은 sub에서만
신분증      OmniOne CX 4단계(trans→request→result→parse) · QR/딥링크 · 전부 서버 호출
영지식      AdultVerify / GenderVerify — 생년월일 안 받고 성인 여부만
개인정보    CI는 sha256(SALT:CI)로만 저장 · 생년월일은 나이 계산 후 폐기
적격        실명 + 만18세 → 일반투자자 연간한도 (수치는 법무 검토 전 placeholder)
경로        page.tsx(얇게) → screens/*(화면) → screens/api.ts(조회) → api/route.ts(경계) → lib/*(규칙) → prisma
자금        DRAFT → IDENTITY_REQUIRED → ELIGIBILITY_CHECKED → CONSENT_REQUIRED → AWAITING_DEPOSIT → DEPOSIT_CONFIRMED → COMPLETED
동의        문서는 고치지 않고 version↑ · 동의 기록에 본문 해시 복사 · 묶음 해시가 Investment.agreementHash
입금        건별 가상계좌 · DepositEvent.providerTransactionId unique · 웹훅 HMAC + timingSafeEqual
집행        증빙 제출 → 검증(AI 또는 관리자) → verified → 서버 게이트 → 온체인 게이트 → completed
AI 신호     contract · receipt · photo · iot — 영수증 항목 ↔ 사진 객체 카테고리 교차검증
서버 게이트 canRelease: 상태 + 증빙 존재 + 판정 기록 3개를 모두 본다
온체인      require: 순서 · verified · 미집행 · 라운드게이트 — 서버가 뚫려도 여기서 막힌다
탈출구      타임아웃 180일(누구나 트리거) · 이의제기 4단계 · 지분 비례 환불
Escrow      비율 합 10000bp 강제 · 생성 후 변경 불가 · releaseTranche는 권한 없음(조건만)
FarmToken   decimals 0 · 1지갑=1신원 양방향 매핑 · 2차이전은 송수신 모두 화이트리스트 · 블록 체크포인트
Dividend    회차별 snapshotBlock · balanceOfAt로 청구 — 발표 후 매수자 청구 차단
RoundGate   파일럿 완주 전 후속 사이트 집행 차단 · 청약은 무관 · setPilot 1회
수탁        1인 1지갑 · AES-256-GCM · DB엔 keyRef만 · 마스터키 없으면 지갑 생성 거부
발행        입금 확인과 같은 트랜잭션에 PENDING → Relay 전송 → CONFIRMED (eventId unique)
실패        지수 백오프 30초부터 5회 → CHAIN_FAILED + 알림. 입금·청약은 되돌리지 않는다
대사        영수증 10분 · 전체 하루 1회 · revert면 해시 삭제 · 불일치는 고치지 않고 사람에게
체인 설정   ONCHAIN_* env로 결정 · 미설정 시 Polygon Amoy · GAS_ZERO면 gasPrice 0 legacy
Vision      Gemini → OpenAI → Anthropic 폴백 · 캐시 키에 이미지 sha256 지문(위조 통과 차단)
LLM         알고리즘 선택만 LLM · 계산은 결정론적 함수 · 키 없으면 규칙 기반 목업
학습 경계   레시피=무엇을 목표로 / 최적화=어떻게 싸게 / 제어=어떻게 도달 — 목적함수는 수익으로 공유
            계산 내용은 optimization-rationale.md · growth-recipe-rationale.md
계산 계층   DB·네트워크 의존 없는 순수 함수 — 웹 API와 앱이 공유 · 파이프라인 조립은 한 곳
외부        은행 · PG · 신탁 · 신분증 · 공개데이터 전부 어댑터 뒤 (출시 전 게이트)
검증        tsc --noEmit · tsx --test(lib 7묶음) · forge test(5묶음, 불변식 포함) · Vercel 프리뷰
```
