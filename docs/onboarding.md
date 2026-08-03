# 온보딩 — 이 코드베이스가 왜 이렇게 생겼나

새로 합류한 사람이 코드를 열기 전에 읽는 문서. "무엇이 있다"보다 **왜 그걸 선택했고, 다른 선택지는 무엇이었나**를 적는다. API 시그니처는 `api-spec.md`, 진행 기록은 `dev-log.md`에 있다.

읽는 순서는 §9에 있다. 처음이면 §1~§2를 읽고 §9로 건너뛰어도 된다.

---

## 1. 이 서비스가 뭘 푸는가

도심에 빈 상가가 있고, 창업하고 싶은데 초기 자본이 없는 청년이 있다. 둘을 붙이면 되는데 그 사이에 두 개의 신뢰 문제가 있다.

**첫째, 투자자는 돈을 어디에 쓰는지 모른다.** 조각투자로 1,750만 원을 모아 운영자에게 한 번에 주면, 그 돈이 실제로 LED와 재배대를 사는 데 쓰였는지 투자자는 확인할 방법이 없다. 현장에 가볼 수도 없고, 운영자가 보내주는 사진을 믿을 수밖에 없다.

**둘째, 매장이 열린 뒤에도 잘 돌아가는지 모른다.** 수익률 6.2%를 약속했는데 그 근거가 되는 매출·수확·가동률 데이터를 투자자와 기관이 볼 수 없으면 약속은 그냥 말이다.

FarmFi는 이 두 문제를 각각 다른 기술로 푼다.

- 첫째 문제 → **에스크로 + 마일스톤 트랜치 + AI 검증**. 돈을 한 번에 안 주고 4단계로 쪼갠다. 각 단계는 증빙(계약서·영수증·현장사진·IoT)을 AI가 판독해 통과해야 열린다.
- 둘째 문제 → **운영 데이터 파이프라인**. 재고·수확·판매·IoT를 앱으로 입력받아 기관 리포트와 투자자 대시보드로 환류한다.

이 두 축이 코드베이스가 크게 두 덩어리로 나뉜 이유다. `subscribe`·`milestones`·`dividends`·`contracts/`가 첫째고, `sales`·`inventory`·`iot`·`reports`가 둘째다.

### 왜 이 구조를 두 번 뒤집었나

이 프로젝트는 6주 동안 방향을 두 번 크게 바꿨고, 그 흔적이 코드에 남아 있다. 이걸 모르면 "왜 여기에 안 쓰는 필드가 있지?" 같은 의문이 계속 생긴다.

1. **6월 — STO 먼저 만듦.** 에스크로·토큰·배당 컨트랙트를 짜고 Polygon Amoy에 실배포했다.
2. **7월 8~15일 — 블록체인을 전부 걷어냈다.** 심사와 사용성 관점에서 "투자자가 지갑을 깔아야 쓸 수 있는 서비스"가 현실적이지 않다고 판단했다. STO 모델 11개를 스키마에서 지우고 순수 운영 인프라로 만들었다.
3. **7월 21일 — 다시 넣었다.** 운영 인프라가 자리 잡고 나니, "돈이 단계적으로 집행된다"는 장치가 없으면 투자자 신뢰 문제가 그대로 남는다는 게 분명해졌다. 빼봤기 때문에 무엇이 꼭 필요한지 알고 다시 넣었다.

재융합 후의 설계 결정 대부분은 이 3단계의 산물이다. 예를 들어 `Project`의 금융 필드(`tokenPrice`·`totalTokens`·`targetAmount`)가 전부 nullable인 이유는, 투자를 받지 않고 운영만 하는 지점도 같은 테이블로 표현해야 하기 때문이다. 2단계에서 운영 전용 모델을 만들어본 경험이 스키마에 그대로 남았다.

---

## 2. 돈이 흐르는 경로

이 흐름 하나가 시스템의 척추다. 코드를 읽다 길을 잃으면 여기로 돌아오면 된다.

```
투자자 청약                  AI가 증빙 판독            검증 통과분만 집행
   │                              │                         │
   ▼                              ▼                         ▼
POST /api/subscribe   →   POST /milestones/[id]/verify  →  POST /milestones/[id]/complete
   │                              │                         │
   │ executeSubscription()        │ verify-contract          │ escrow.remaining 차감
   │ · 잔액·재고 검사              │ verify-receipt           │ Transaction 기록
   │ · 연간한도 집행               │ verify-photo             │ 다음 마일스톤 활성화
   │ · escrow.remaining 증가       │ detect-anomaly           │ releaseTrancheOnChain()
   │                              │ + 교차검증                │
   ▼                              ▼                         ▼
 TokenHolding              milestone.status               운영자에게 트랜치 지급
 (누가 몇 구좌)             = verified                     (마지막 단계면 status=operating)
                           verifyMilestoneOnChain()
```

그리고 매장이 돌기 시작하면 두 번째 루프가 붙는다.

```
운영자 앱 판매 입력 → SalesRecord → 재고 차감 → 기관 리포트
IoT 센서 데이터    → IotData     → 이상탐지 → 알림 + 마일스톤 IoT 신호
                                            → 수수료 풀 → 분기 배당
```

핵심은 **AI 검증이 자금 집행의 게이트라는 것**이다. `verify`가 통과시키지 않으면 `complete`가 400을 뱉고 돈이 안 나간다. 강제 통과 경로는 의도적으로 만들지 않았다. 이게 서비스 전체의 신뢰 주장이라, 여기에 우회로를 두면 주장 자체가 무너진다.

---

## 3. 데이터 계층 — Prisma 7 + Supabase

### 왜 Prisma이고, 왜 어댑터를 주입하나

`src/lib/db.ts`가 11줄인데 이 11줄에 두 개의 함정이 들어 있다.

```ts
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });
```

**`new PrismaClient()`를 무인자로 쓰면 안 된다.** Prisma 7부터 DB 커넥션을 driver adapter로 외부 주입하는 구조로 바뀌었다. 인터넷에 널린 예제는 대부분 Prisma 5~6 기준이라 무인자 생성자를 쓰는데, 그대로 복사하면 런타임에 깨진다. datasource URL도 `schema.prisma`가 아니라 `prisma.config.ts`에 있다.

**`globalForPrisma` 캐싱은 개발 모드 때문이다.** Next.js dev 서버는 파일이 바뀔 때마다 모듈을 다시 평가한다. 그때마다 새 `PrismaClient`를 만들면 커넥션이 계속 쌓여서 몇 분 만에 커넥션 풀이 고갈된다. 전역에 한 번 붙여두고 재사용한다. 프로덕션은 프로세스가 한 번만 뜨므로 이 캐싱을 안 한다.

### pooler 포트 두 개를 왜 나눠 쓰나

Supabase는 커넥션 풀러를 두 종류로 준다. 이걸 모르면 마이그레이션이 그냥 멈춘 채로 안 끝난다.

| 포트 | 종류 | 쓰는 곳 | 이유 |
|---|---|---|---|
| 6543 | 트랜잭션 pooler | 런타임 쿼리, 시드(DML) | 서버리스에서 커넥션을 짧게 쓰고 반납하는 데 최적 |
| 5432 | 세션 pooler | `prisma db push` (DDL) | 트랜잭션 pooler는 prepared statement·세션 상태를 지원하지 않아 DDL이 걸린다 |

그래서 스키마를 바꿀 땐 `--url`로 5432를 명시해 오버라이드한다. 일반 `DATABASE_URL`은 6543이다.

무료 플랜은 일정 시간 트래픽이 없으면 DB를 자동 일시정지한다. `tenant or user not found` 에러가 나면 자격증명 문제가 아니라 대부분 이것이다. Supabase 대시보드에서 Restore를 누르면 된다.

### 스키마가 22개 모델인 이유

STO 11 + 운영 5 + 공통 6이다. 재융합 때 두 세트를 합치면서 두 가지를 열어뒀다.

- `Project`의 금융 필드를 nullable로 — 운영 전용 지점(2호점)은 청약 대상이 아니다. `executeSubscription`이 이 셋 중 하나라도 null이면 `"Project is not open for funding"`으로 400을 낸다.
- `Notification.milestoneId`·`projectId`를 둘 다 optional로 — 알림이 마일스톤에서도 오고 IoT 이상에서도 오는데, 둘의 출처가 다르다.

---

## 4. 인증 — 왜 이렇게 두 번 바뀌었나

### SIWE에서 이메일로

처음엔 SIWE(Sign-In with Ethereum)를 썼다. 지갑으로 서명해서 로그인하는 방식이다. STO 서비스니까 자연스러워 보였는데, 피벗 때 이게 진입장벽의 핵심이라고 판단해 이메일+비밀번호로 바꿨다.

그 흔적이 `SessionPayload`에 남아 있다.

```ts
export interface SessionPayload {
  userId: string;
  role: Role;
  // 레거시(SIWE) 세션 호환용. 이메일+비밀번호 세션에는 없다.
  walletAddress?: string;
}
```

세션의 정체성은 `userId + role`이고 `walletAddress`는 옵셔널로 강등됐다. 지갑은 이제 "로그인 수단"이 아니라 "계정에 부착하는 속성"이다.

비밀번호 해시는 `bcryptjs`를 쓴다. 네이티브 `bcrypt`는 빌드에 C++ 컴파일이 필요해서 Vercel 배포에서 문제가 되기 쉽다. 순수 JS 구현이 느리긴 하지만 이 규모에선 문제없다.

### 쿠키와 Bearer를 둘 다 받는 이유

`getServerSession()`이 쿠키를 먼저 보고, 없으면 `Authorization: Bearer`로 폴백한다.

```ts
let token = cookieStore.get(SESSION_COOKIE)?.value;
if (!token) {
  const authHeader = (await headers()).get("authorization");
  if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7);
}
```

웹(`frontend/`)은 httpOnly 쿠키가 안전하다. XSS로 토큰을 훔쳐갈 수 없다. 그런데 React Native 앱(`app/`)에는 브라우저 쿠키 저장소가 없다. 앱은 로그인 응답 body로 토큰을 받아 `SecureStore`에 넣고 헤더로 보낸다.

한 함수가 두 경로를 다 받게 해서, 라우트 핸들러는 자기가 웹에서 불렸는지 앱에서 불렸는지 신경 쓸 필요가 없다. 38개 라우트를 두 벌로 만들지 않아도 되는 게 이 설계의 값어치다.

### requireRole이 Response를 throw하는 이유

```ts
export async function requireRole(role: Role): Promise<SessionPayload> {
  const session = await getServerSession();
  if (!session) throw new Response(..., { status: 401 });
  if (session.role !== role && session.role !== "admin") throw new Response(..., { status: 403 });
  return session;
}
```

값을 반환해서 호출부가 검사하게 하면, 검사를 빼먹은 라우트가 조용히 무인증이 된다. 실제로 재융합 직후 복원한 라우트 4개가 그런 상태였고 코드리뷰에서 잡혔다. throw 방식은 호출부가 `try/catch`로 감싸 그대로 되돌리기만 하면 되고, 빼먹으면 500이 나서 눈에 띈다. 조용한 실패보다 시끄러운 실패가 낫다.

admin이 모든 역할을 통과하는 건 관리자 콘솔과 데모 오케스트레이션이 여러 역할의 API를 가로질러 호출하기 때문이다.

---

## 5. 청약 — 왜 라이브러리로 뺐나

`executeSubscription()`이 `src/lib/subscription.ts`에 있고, 라우트는 얇다. 처음엔 라우트 안에 다 있었는데 옮겼다.

이유는 데모 오케스트레이터다. `/api/demo/step`이 8단계를 순차 실행하는데, 예전엔 각 단계가 자기 자신의 API를 HTTP로 self-fetch했다. 이게 두 가지 문제를 만들었다.

1. **인증이 깨진다.** 코드리뷰로 `subscribe`에 세션 게이트를 걸자 self-fetch가 401을 받았다. 서버가 자기 자신을 부르는데 쿠키가 없으니 당연하다.
2. **`NEXT_PUBLIC_BASE_URL` 의존이 생긴다.** self-fetch 대상 URL을 어디선가 알아내야 하는데, 이 값은 빌드 타임에 인라인되는 환경변수다. 로컬 `.env`의 `localhost:3000`이 프로덕션 번들에 그대로 구워져서 배포판이 ECONNREFUSED로 죽은 적이 있다.

핵심 로직을 함수로 빼면 데모는 HTTP를 거치지 않고 직접 부른다. 신뢰된 서버 내부 경로라 인증도 URL도 필요 없다.

```ts
// /api/subscribe: 세션 유저로 호출 (본인인증·연간한도 게이트 포함)
// /api/demo/step: 시드 투자자로 직접 호출 (신뢰된 서버 내부 경로, HTTP self-fetch 제거)
```

`annualLimit` 파라미터가 optional인 것도 이 때문이다. 실 사용자 경로는 한도를 넘기고, 데모 경로는 생략한다.

### 연간 투자한도가 왜 있나

자본시장법상 온라인소액투자중개는 일반투자자의 연간 투자액에 상한이 있다. `src/lib/identity/investor-limit.ts`가 KYC로 받은 신원 클레임(실명·생년월일)으로 적격 여부와 한도를 산출하고, `executeSubscription`이 그해 누적 청약액과 합쳐 집행한다.

```ts
const startOfYear = new Date(new Date().getFullYear(), 0, 1);
const agg = await prisma.transaction.aggregate({ _sum: { amount: true }, where: { userId, type: "subscription", createdAt: { gte: startOfYear } } });
if (yearInvested + totalCost > annualLimit) return { ok: false, status: 400, error: "Annual investment limit exceeded" };
```

한도 상수(2,000만 원)는 placeholder다. 파일 주석에 명시해뒀다. 실제 값은 법무 검토를 거쳐야 해서, 해커톤 범위에서는 "룰엔진이 있고 실제로 집행된다"까지만 만들었다.

### DB 트랜잭션으로 묶은 이유

청약 한 건이 5개 테이블을 건드린다. 잔액 차감, 프로젝트 판매량 증가, 에스크로 잔액 증가, 보유 지분 upsert, 거래 기록 생성. 중간에 하나만 실패하면 "돈은 빠져나갔는데 지분이 없다" 같은 상태가 남는다. `prisma.$transaction`으로 전부 묶어 원자화했다.

---

## 6. AI 검증 — 이 시스템의 핵심 주장

### 왜 AI인가

마일스톤 달성 판정을 사람이 하면 두 가지가 문제다. 심사자를 매 사이트마다 보내는 건 비용이 안 맞고, 운영자가 제출한 사진만 보고 판단하면 그냥 서류 심사다. AI 비전으로 증빙을 판독하면 판정 기준이 코드로 고정되고 재현 가능해진다.

여기서 중요한 건 AI가 **부가 기능이 아니라 자금 집행 게이트**라는 점이다. 검증 실패 = 트랜치 미집행이다.

### 4개 신호와 교차검증

마일스톤마다 `requiredSignals` 배열이 있고, 거기 적힌 신호를 전부 통과해야 한다.

| 신호 | 하는 일 | 판정 |
|---|---|---|
| `contract` | 임대차 계약서에서 주소·면적 추출 | 프로젝트 등록 정보와 대조 (면적 ±20%) |
| `receipt` | 설비 구매 영수증에서 품목 추출 | 마일스톤 조건 부합 여부 |
| `photo` | 현장 사진에서 객체 검출 | 설비·작물 존재 확인 |
| `iot` | 센서 데이터 조회 | 가동률 또는 이상 미검출 |

여기에 **교차검증**이 붙는다. 영수증과 사진을 각각 통과시키는 것만으로는 부족하다. LED를 산 영수증과, 다른 곳에서 찍은 LED 사진을 각각 내면 둘 다 통과한다. 그래서 "영수증에 있는 품목이 사진에도 보이는가"를 본다.

```ts
const CROSS_CHECK_CATEGORIES: string[][] = [
  ["led", "조명", "라이트", "light", "lamp"],
  ["센서", "sensor"],
  ["재배", "선반", "베드", "rack", "bed", "shelf"],
  ["관수", "급수", "펌프", "양액", "pump", "irrigation"],
];
```

카테고리 단위로 매칭하는 이유는 AI가 같은 물건을 영수증에서는 "LED 바"로, 사진에서는 "조명"으로 부르기 때문이다. 문자열 완전일치로는 절대 안 맞는다. 카테고리 하나라도 양쪽에 걸리면 통과다.

### provider 폴백 — 무료로 돌리기 위해

`src/lib/ai-vision.ts`가 키가 설정된 provider만 순서대로 시도한다.

```ts
if (process.env.GEMINI_API_KEY) providers.push(callGemini);   // 무료
if (process.env.OPENAI_API_KEY) providers.push(callOpenAI);
if (process.env.ANTHROPIC_API_KEY) providers.push(callAnthropic);
```

현재는 Gemini(`gemini-2.5-flash`)만 키가 있어서 무료로 돌아간다. 유료 전환이 필요하면 키만 채우면 되고 라우트 코드는 안 건드려도 된다. 세 provider의 이미지 입력 포맷이 전부 달라서(inlineData / image_url / source.base64) 이 추상화가 없으면 라우트 3곳에 분기가 흩어진다.

응답에서 JSON을 뽑을 때 정규식으로 첫 `{...}` 블록을 잡는다. LLM이 JSON 앞뒤에 설명을 붙이는 일이 흔해서, 파싱을 바로 하면 깨진다.

### IoT 신호가 두 갈래인 이유

```ts
if (milestone.iotMinDays > 0) {
  signals.iot = (data.uptimeRate ?? 0) >= 90;
} else {
  signals.iot = (data.dataCount ?? 0) > 0 && !data.anomalyDetected;
}
```

마일스톤에 따라 묻는 게 다르다. "60일 이상 안정 가동"을 요구하는 마일스톤은 **가동률**을 봐야 하고, "지금 정상인가"를 묻는 마일스톤은 **이상 유무**를 본다.

두 번째 분기에 `dataCount > 0` 조건이 붙은 게 중요하다. 이게 없으면 IoT 데이터가 아예 없는 프로젝트가 "이상 없음"으로 자동 통과한다. 데이터가 없는 것과 데이터가 정상인 것은 다르다.

### 재시도 2회 후 수동 검토

```ts
const newRetryCount = milestone.retryCount + 1;
const newStatus = newRetryCount >= 2 ? "manual_review" : milestone.status;
```

AI가 틀릴 수 있다. 실제로 Gemini는 같은 이미지에도 간헐적으로 추출에 실패한다. 1회 실패로 프로젝트를 죽이면 오탐 하나에 자금이 묶인다. 반대로 무한 재시도를 허용하면 운영자가 통과할 때까지 계속 던질 수 있다.

2회로 끊고 사람에게 넘긴다. `manual_review` 상태가 되면 `complete`가 `"Requires admin approval"` 400을 내서 자동 집행이 막힌다.

### 이중집행 차단

`verify`는 이미 `completed`인 마일스톤을 거부한다.

```ts
if (milestone.status === "completed") {
  return NextResponse.json({ error: "Milestone already completed" }, { status: 400 });
}
```

이게 없으면 완료된 마일스톤을 다시 `verified`로 되돌리고 `complete`를 재실행해 트랜치를 두 번 받을 수 있다. 상태 기계에서 되돌아가는 전이를 막는 것이 요점이다.

`complete` 쪽은 더 강하게 막는다. 사전 검사만으로는 동시 요청 두 개가 둘 다 통과할 수 있어서(TOCTOU), 실제 차단은 조건부 업데이트가 한다.

```ts
const claimed = await tx.milestone.updateMany({ where: { id, status: "verified" }, data: { status: "completed", ... } });
if (claimed.count === 0) throw new Error("ALREADY_COMPLETED");
```

`status: "verified"`인 행만 골라 갱신하므로, 동시 요청 중 하나만 `count: 1`을 받는다. 나머지는 0을 받고 트랜잭션이 롤백된다.

---

## 7. 온체인 — 왜 앵커링인가

### 완전 온체인을 안 한 이유

투자금 전액을 실제로 컨트랙트에 넣고 굴리는 게 이상적이지만 두 가지가 막았다.

1. **테스트넷 faucet 한도.** Amoy에서 받을 수 있는 POL이 0.3 정도다. 1,750만 원어치 청약을 온체인으로 재현할 수 없다.
2. **투자자가 지갑을 깔아야 한다.** 이게 피벗의 원인이었던 그 진입장벽이다.

그래서 **증명 앵커링** 방식을 택했다. 사업 수치(구좌·금액)는 DB가 들고, 온체인에는 서버 지갑이 소액으로 부트스트랩 청약을 한 번 넣어두고 `verifyMilestone`·`releaseTranche`를 실제로 호출한다. 결과로 나오는 트랜잭션 해시가 "이 검증이 실제로 일어났다"는 변조 불가능한 증거가 된다.

투자자 입장에서 얻는 것은 "돈이 온체인에 있다"가 아니라 "검증 사건이 온체인에 기록됐다"이다. 후자만으로도 운영사가 나중에 기록을 고칠 수 없다는 보장은 성립한다.

### 온체인 실패가 DB를 막지 않는다

```ts
let txHash: string | null = null;
try {
  txHash = await verifyMilestoneOnChain(milestone.seq);
} catch (e) {
  console.error("verifyMilestoneOnChain failed:", e);
}
```

체인 호출을 전부 `try/catch`로 격리한다. Amoy RPC는 자주 불안정하고, 시연 중에 RPC가 죽었다고 데모 전체가 멈추면 안 된다. `isOnchainEnabled()`가 주소·키 미설정 시 `null`을 반환하는 것도 같은 목적이다 — 배포 전에도, 키 없는 로컬 환경에서도 앱이 돈다.

대가로 `txHash`가 `null`일 수 있다. UI는 이 경우 온체인 증거 영역을 비운다.

### 체인을 env로 갈아끼우는 이유

```ts
const CHAIN_ID = Number(process.env.ONCHAIN_CHAIN_ID || "80002");
const GAS_ZERO = process.env.ONCHAIN_GAS_ZERO === "true";
```

Polygon Amoy가 기본이지만 OmniOne Chain(201210)으로도 갈아끼울 수 있게 했다. OmniOne은 gas가 0이라 legacy 트랜잭션에 `gasPrice: 0`으로 보내야 하고, 공개 탐색기가 없어서 링크 대신 해시를 텍스트로만 보여준다(`EXPLORER_BASE`에 빈 문자열).

기존 `ESCROW_ADDRESS`·`PRIVATE_KEY`는 지우지 않고 폴백으로 남겼다. `ONCHAIN_*`를 비우면 즉시 Amoy로 돌아간다. 시연 직전에 체인이 문제를 일으키면 환경변수 하나로 롤백할 수 있어야 한다.

`ONCHAIN_RPC_URL`에 `NEXT_PUBLIC_` 접두사가 없는 건 의도적이다. RPC URL에 API 키가 박히는 경우가 많은데, `NEXT_PUBLIC_`을 붙이면 클라이언트 번들에 그대로 인라인된다. 이 모듈은 서버 라우트에서만 쓰인다.

### BigInt 리터럴을 못 쓴다

코드에 `BigInt(0)`은 있는데 `0n`은 없다. `tsconfig`의 target이 es2017이라 BigInt 리터럴 문법이 파싱 에러를 낸다. 이걸 모르고 `0n`을 쓰면 로컬 `tsc`는 통과하는데 Vercel 빌드가 깨진다. 실제로 배포가 한 번 막혔다.

---

## 8. 스마트 컨트랙트

### Escrow — 상태 기계

`contracts/src/Escrow.sol` 188줄이 이 프로젝트 온체인의 전부에 가깝다. 핵심은 `currentMilestone` 하나로 순서를 강제하는 것이다.

```solidity
function releaseTranche(uint256 seq) external nonReentrant {
    require(!projectFailed, "Project failed");
    require(seq == currentMilestone, "Wrong sequence");   // 순서 강제
    require(milestones[seq].verified, "Not verified");     // 검증 선행
    require(!milestones[seq].released, "Already released"); // 이중집행
    ...
}
```

`seq == currentMilestone`이라 2단계를 건너뛰고 3단계를 받을 수 없다. `verified`는 `VERIFIER_ROLE`만 세울 수 있고, 그 역할은 서버 지갑이 갖는다. 즉 **AI 검증을 통과해 서버가 온체인에 기록해야만** 트랜치가 열린다. 오프체인의 게이트 구조가 온체인에서 한 번 더 강제된다.

`releaseTranche` 자체는 아무나 호출할 수 있다. 가드가 상태에 걸려 있어서 권한을 따로 둘 필요가 없고, 오히려 운영사가 집행을 미루는 걸 막는 효과가 있다.

### 왜 타임아웃 탈출구가 있나

```solidity
uint256 public constant MILESTONE_TIMEOUT = 180 days;

function triggerTimeoutFailure() external {
    require(block.timestamp > milestoneDeadline, "Deadline not passed");
    projectFailed = true;
    ...
}
```

운영사가 실패 선언을 안 하면 자금이 영원히 컨트랙트에 묶인다. `markFailed`는 admin만 부를 수 있으니, admin이 잠수하면 투자자가 할 수 있는 게 없다. `triggerTimeoutFailure`는 권한 검사가 없어서 마감이 지나면 **투자자를 포함해 누구나** 실패로 전환할 수 있다.

이건 "운영사의 선의를 믿지 않는다"는 설계다. 신뢰 인프라를 표방하면서 자금 동결 해제를 운영사 재량에 두면 앞뒤가 안 맞는다.

180일이라는 값은 `src/lib/onchain.ts`에 `MILESTONE_TIMEOUT_DAYS`로 미러링돼 있다. DB의 `deadlineAt` 계산이 컨트랙트 규칙과 같아야 해서다. 컨트랙트를 바꾸면 여기도 같이 바꿔야 한다 — 두 곳에 같은 상수가 있는 건 좋지 않지만, 온체인 상수를 매번 읽어오는 비용보다는 낫다고 판단했다.

### 환불이 온체인과 DB로 갈라진 이유

컨트랙트에 `refund()`가 있는데 우리 API는 그걸 안 부른다. 이유가 명확하다.

```solidity
uint256 invested = investments[msg.sender];
require(invested > 0, "No investment");
```

컨트랙트의 `investments`는 온체인 `subscribe()`를 호출해야 쌓인다. 우리 투자자는 DB(`TokenHolding`)로 청약했고 온체인 `subscribe`를 부른 적이 없다. 그래서 온체인 `refund`는 우리 투자자에게 항상 revert한다.

환불은 `POST /api/projects/[id]/refund`가 DB에서 비례 계산으로 집행하고, 컨트랙트의 `refund()`는 지갑으로 직접 청약한 온체인 투자자용 경로로 남겼다. 이 비대칭은 앵커링 방식을 택한 이상 불가피하다. `onchain.ts` 하단에 주석으로 적어뒀다.

### RoundGate — 파일럿 실증 게이트

라운드로 여러 사이트를 동시에 모집할 때, 1호점이 검증되기도 전에 나머지 사이트가 돈을 집행하면 위험이 한꺼번에 터진다. `RoundGate`는 파일럿이 전 마일스톤을 통과해야 나머지 사이트의 집행이 열리게 한다.

```solidity
function isOpen(address site) external view returns (bool) {
    return site == pilot || pilotCompleted();
}
```

`Escrow.releaseTranche`가 이걸 조회한다. 게이트가 `address(0)`이면 무제한이라 단독 사이트는 영향받지 않는다. 청약(모집)은 게이트와 무관하게 진행되고, 파일럿이 실패하면 나머지 사이트 투자금은 미집행 상태 그대로 환불 경로를 탄다.

`setRoundGate`는 첫 집행 전 1회만 가능하다. 자금이 움직이기 시작한 뒤에 게이트를 바꾸면 투자 조건이 사후 변경되는 셈이라 막았다.

**주의: 이 컨트랙트는 배포 스크립트에는 있지만 백엔드 TS 어디에서도 참조하지 않는다.** 온체인에는 게이트 로직이 존재하는데 서버는 그 상태를 읽지도 쓰지도 않는다. §11에 미결로 적어뒀다.

### 테스트

`forge test`로 19개가 돈다. 그중 `Escrow.invariant.t.sol`이 fuzz/invariant 테스트인데, 무작위 액션 조합 128,000회를 돌려 두 가지 불변식을 검증한다.

- **지급여력**: 컨트랙트 잔고가 항상 `remaining` 이상이다. 누가 강제로 ETH를 밀어 넣어도 깨지지 않는다.
- **자금 보존**: 들어온 총액 = 운영자 지급 + 투자자 환불 + 잔여. 환불 경로를 포함해도 한 푼도 새거나 생기지 않는다.

비례 환불은 정수 나눗셈이라 dust가 남기 쉬운데, 이 테스트로 드리프트가 없음을 확인했다. 단위 테스트로는 이런 종류의 회계 오차를 못 잡는다.

---

## 9. 배당 — 코드와 기획이 갈라져 있는 지점

**먼저 알아둘 것.** 기획 문서(`service-plan.md`·`sto-plan.md`)와 발표자료는 배당을 **매장 매출에 연동**해 투자 지분 비율대로 매달 지급한다고 서술한다. 그런데 지금 `waterfall.ts`가 구현한 것은 **FarmFi 수수료 풀 모델**이다. 아직 정합되지 않은 상태이며, 어느 쪽으로 맞출지는 팀 결정 사항이다. 이 절은 **현재 코드가 하는 일**을 설명한다.

아래는 구현된 수수료 풀 모델의 설계 근거다. 보통 조각투자는 매출이나 이익을 나누는데, 이 구현은 **운영자 매출에서 배당을 떼지 않는다.**

```
// v18 §2 설계 원칙 2 — "운영자 주머니 불가침: 배당은 운영자 매출이 아니라 FarmFi
// 수수료에서 나온다. 운영자가 살아야 전부 산다."
```

이유는 대상이 청년 창업자라서다. 매출에서 배당을 떼면 창업 초기에 현금흐름이 가장 빠듯한 사람에게서 돈을 빼는 구조가 된다. 그러면 운영자가 버티지 못하고, 운영자가 망하면 투자자도 못 받는다.

대신 배당 재원은 FarmFi가 버는 수수료 풀이다.

| 항목 | 요율 | 배당 재원 포함 |
|---|---|---|
| 플랫폼 이용료 | 월 20만/사이트 | 포함 |
| 체험 프로그램 중개 | 체험 매출의 30% | 포함 |
| B2B 신규계약 성사 | 증분 매출의 8% | 포함 (실적 있을 때만) |
| 온보딩피 | 400만/사이트 | **제외** — 1회성 셋업 대가 |

풀의 60%가 투자자 배당, 40%가 FarmFi 운영이다.

`waterfall.ts`에 근사가 하나 들어 있고 주석으로 명시해뒀다. 체험 프로그램 실적을 담는 테이블이 스키마에 없어서(`SalesRecord`는 작물 판매만 담는다) 체험 개최 횟수를 작물 매출로 추정한다. 이건 운영자 작물 매출에 과금하는 게 아니라 "매장이 얼마나 활발한가"의 프록시로만 쓴다. 체험 예약 테이블이 생기면 실측치를 직접 넘겨야 한다.

`operatorRevenue`가 결과 객체에 들어 있지만 배당 계산에서 차감되지 않는다. 참고 표시용이다.

---

## 10. KYC — 로그인과 별개다

`docs/opendid-verifier-연동.md`에 상세가 있다. 여기선 왜 이게 필요하고 왜 로그인과 분리했는지만 적는다.

**필요한 이유**: 자본시장법상 투자자는 실명·성인 확인이 필요하고, 연간 투자한도도 신원 정보 기반으로 산출된다. 이메일 가입만으로는 이걸 못 한다.

**분리한 이유**: 로그인은 서비스 이용 전체의 관문이고, KYC는 청약 직전에만 필요하다. 둘을 묶으면 둘러보기만 하려는 사람도 신분증을 꺼내야 한다. 그래서 이메일로 가입·로그인하고, 청약 시점에 `identityVerified` 게이트가 걸린다.

**왜 OpenDID인가**: 라온시큐어 OmniOne OpenDID는 모바일 신분증 표준이다. 중앙 서버가 주민번호를 보관하지 않고, 사용자 지갑이 VC(검증 가능한 자격증명)를 들고 있다가 필요한 클레임만 제출한다. 실명 확인을 위해 PII를 우리가 저장하지 않아도 되는 게 핵심 이점이다.

Oracle Cloud에 OpenDID 풀스택(TAS·Issuer·Verifier·CAS·Wallet)을 직접 세워서 돌리고 있다. 앱은 Verifier(8092)에 붙어 `request-offer-qr`로 검증 QR을 받는다.

`IDENTITY_PROVIDER`가 설정 안 되면 stub 구현이 3초 후 자동 인증한다. 외부 서버가 죽어도 데모가 진행되게 하려는 장치다.

---

## 11. 운영 데이터 — IoT 판정이 두 겹인 이유

`iot-health.ts`에 판정이 두 개 있다. 이게 헷갈리기 쉬워서 짚어둔다.

**절대 범위 판정 (`isHealthy`)** — 마일스톤 게이트용.

```ts
export const HEALTHY_RANGES = {
  temperature: [18, 26],
  humidity: [55, 75],
  co2Level: [800, 1400],
  ...
};
```

**Z-score 판정 (`detectAnomalies`)** — 대시보드 알림용. 최근 분포 대비 3σ를 벗어나면 이상.

왜 둘 다 필요한가. Z-score만 쓰면 **지속성 고장을 놓친다.** 히터가 고장 나서 온도가 계속 35℃면, 판정 윈도우의 평균 자체가 35℃가 되어 편차가 0에 가까워진다. Z-score는 이걸 "정상"으로 흡수한다. 마일스톤 가동률처럼 "제대로 운영됐나"를 묻는 데는 절대 기준이 필요하다.

반대로 절대 범위만 쓰면 **일시적 스파이크를 못 잡는다.** 범위 안에서 튀는 값은 걸리지 않는다.

정상 범위 수치는 수직농장 상추 재배 문헌에서 가져왔고 주석에 출처를 적어뒀다. 처음엔 새싹삼 기준이었는데 작물을 바꾸면서 함께 보정했다. Kaggle의 노지 재배 데이터도 검토했으나 실내 수직농장과 도메인이 달라 쓰지 않았다.

---

## 12. 데모 오케스트레이션

`/api/demo/reset`과 `/api/demo/step`이 8단계 시나리오를 자동 재생한다.

| 스텝 | 하는 일 |
|---|---|
| 1~3 | 투자자 3명 청약 (300·200·420구좌) → 4,400구좌 완납 |
| 4~6 | 마일스톤 1·2·3 검증 + 트랜치 집행 |
| 7 | 배당 분배 |
| 8 | 마일스톤 4 검증 + 최종 트랜치 → `status: operating` |

배당(7)이 마지막 마일스톤(8) 앞에 오는 게 이상해 보이지만, 매장은 마지막 마일스톤 전에 이미 운영을 시작한다. 4단계가 "지속 운영 검증"이라 배당이 먼저 나가는 게 시간 순서상 맞다.

### 프로젝트를 tokenSymbol로 찾는 이유

```ts
// 가변 status가 아니라 안정적인 tokenSymbol로 식별한다 (스텝 전 구간 동일 프로젝트).
```

원래 `status: "funding"`으로 대상을 찾았는데, 스텝 1~3에서 청약이 완납되면 status가 `funded`로 바뀌어서 스텝 4가 "프로젝트를 못 찾겠다"며 멈췄다. 자기가 바꾼 값으로 자기를 다시 찾는 구조였다. `tokenSymbol`은 안 변한다.

이런 종류의 버그는 타입 체크로 안 잡힌다. 실제로 끝까지 돌려봐야 나온다.

### DEMO_MODE — live와 cached

```ts
export type DemoMode = "live" | "cached";
```

`live`는 실제로 Gemini를 부르고 온체인 트랜잭션을 보낸다. `cached`는 `DemoCache`에 저장된 성공 결과를 재생한다.

발표에서 cached를 쓰는 이유가 세 가지다.

1. Gemini가 간헐적으로 추출에 실패한다. 재검증하면 통과하지만 발표 중에 기다릴 수 없다.
2. 온체인 `releaseTranche`는 **배포당 1회성**이다. 한 번 집행하면 `Already released`로 revert한다. 반복 시연하려면 재배포하거나 캐시 재생을 해야 한다.
3. live 실행은 온체인 트랜잭션 8개 때문에 20~40초가 더 걸린다.

실패한 스텝은 캐시에 저장하지 않는다. 실패를 재생하면 캐시 모드의 의미가 없다.

---

## 13. 읽는 순서

코드를 처음 여는 사람에게 권하는 경로다.

1. `frontend/prisma/schema.prisma` — 도메인 모델 22개. 여기서 명사를 익힌다.
2. `frontend/src/lib/db.ts`, `auth.ts` — 모든 라우트가 이 둘을 쓴다. 짧다.
3. `frontend/src/lib/subscription.ts` — 청약 한 건이 어떻게 5개 테이블을 원자적으로 건드리는지.
4. `frontend/src/app/api/milestones/[id]/verify/route.ts` — AI 게이트. 이 프로젝트의 핵심 주장이 여기 있다.
5. `frontend/src/app/api/milestones/[id]/complete/route.ts` — 자금 집행과 동시성 방어.
6. `contracts/src/Escrow.sol` — 오프체인 게이트가 온체인에서 어떻게 다시 강제되는지.
7. `frontend/src/lib/onchain.ts` — 서버가 체인에 쓰는 유일한 통로.
8. `frontend/src/app/api/demo/step/route.ts` — 전체 흐름을 한 파일에서 조망.

앱(`app/`)은 운영자용 6화면이라 위 흐름과 독립적이다. 나중에 봐도 된다.

---

## 14. 로컬에서 돌리기

```bash
cd frontend
npm install
npm run prisma:generate    # 스키마 → 타입 생성
npm run dev                # localhost:3000
```

DB 스키마를 바꿨다면:

```bash
npx prisma db push --url "postgresql://...@...:5432/postgres"   # 세션 pooler(5432) 필수
npm run seed                                                     # 시드는 6543으로 OK
```

### 검증은 tsc + dev로 한다

```bash
npx tsc --noEmit
```

`npm run build`는 로컬에서 실패한다. 경로에 한글(`D:\해커톤`)이 있고 Node 22 + Next 14.2 조합에서 `readlink`가 EISDIR를 낸다. 클린 상태에서도 재현되는 환경 문제라 코드 문제가 아니다. 프로덕션 빌드는 Vercel(Linux)에서 돈다.

그래서 검증 루틴이 `tsc --noEmit` + `next dev` + curl이다. 이 조합이 잡지 못하는 게 있다는 걸 알고 있어야 한다 — es2017 BigInt 리터럴 문제가 딱 그 사례로, 로컬 tsc는 통과하는데 Vercel 빌드가 깨졌다.

### 필요한 환경변수

`CONTRIBUTING.md`에 목록이 있다. 최소 구동은 `DATABASE_URL` + `JWT_SECRET` + `GEMINI_API_KEY`면 된다. 온체인·KYC 키가 없어도 앱은 돌고, 해당 기능이 비활성(`null` 반환 / stub)으로 떨어진다.

---

## 15. 함정 목록

앞에서 설명한 것들을 한자리에 모았다. 대부분 한 번씩 실제로 당한 것들이다.

| 함정 | 증상 | 대응 |
|---|---|---|
| `new PrismaClient()` 무인자 | 런타임 커넥션 실패 | `PrismaPg` 어댑터 주입 |
| DDL을 6543으로 | `prisma db push`가 안 끝남 | `--url`로 5432 오버라이드 |
| Supabase 무료플랜 일시정지 | `tenant or user not found` | 대시보드 Restore |
| BigInt 리터럴 `0n` | 로컬 통과, Vercel 빌드 실패 | `BigInt(0)` 생성자 |
| `NEXT_PUBLIC_BASE_URL` self-fetch | 프로덕션 ECONNREFUSED | 요청 origin 사용 |
| `npm run build` 로컬 실행 | EISDIR | tsc + dev로 검증 |
| 온체인 release 재실행 | `Already released` revert | 재배포 또는 `DEMO_MODE=cached` |
| status로 데모 대상 식별 | 스텝 중간에 대상 유실 | `tokenSymbol` 같은 불변값 사용 |
| 내부 self-fetch에 인증 누락 | 401/403 | 호출자 자격증명(Bearer/쿠키) 전달 |

---

## 16. 지금 비어 있는 곳

정직하게 적어둔다. 여기가 다음 작업 후보다.

**RoundGate가 백엔드에 안 붙어 있다.** 컨트랙트에 구현이 있고 `Deploy.s.sol`이 배포하고 `Escrow`가 조회하는데, 서버 TS 어디에서도 참조하지 않는다. 라운드 게이팅을 시연하려면 배선이 필요하고, 안 할 거면 기획안 §8의 서술을 실제에 맞춰야 한다.

**RoundGate 전용 테스트가 없다.** 다른 컨트랙트는 각각 테스트 파일이 있는데 `RoundGate.t.sol`이 없다. `V16Hardening.t.sol`이 일부만 건드린다.

**지갑 연결 백엔드가 삭제된 상태다.** `POST /api/auth/wallet`과 `/nonce`(viem `verifyMessage`)를 만들었다가 07-25 커밋에서 지워졌다. 커밋 메시지가 배당 관련이라 의도적 제거인지 병합 사고인지 불명확하다. 앱에서 지갑 서명으로 주소를 부착하는 경로가 지금은 없다.

**앱이 운영자 전용이다.** `app/`에 매장·배정·생육·재고·모니터링·판매 6화면과 로그인만 있다. 투자자 흐름(청약·포트폴리오·KYC 화면)은 웹에만 있다.

**운영 데이터가 합성 시드다.** IoT와 판매 실적이 실제 매장이 아니라 생성기에서 나온다. 생육 최적화는 스마트팜코리아 실데이터를 일부 차용해 완화했다. AI 검증은 파운데이션 모델이라 학습 데이터가 따로 필요 없다는 점은 다행이다.

**투자한도 상수가 placeholder다.** 자본시장법 실제 수치가 아니다. 실 서비스 전 법무 검토가 필요하다.

**배당 모델이 문서와 코드에서 다르다.** 기획 문서·발표자료는 매출 연동 배당(목표 15개월 원금 회수 + 연 12%)을, 코드는 FarmFi 수수료 풀 배당을 구현하고 있다. 시드 규모도 문서 1,750만원 대 코드 4,400만원(4,400구좌)으로 갈린다. §9 참조.
