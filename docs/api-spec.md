# FarmFi API 명세서

> 프론트 ↔ 백엔드 공유 문서. **API가 바뀌면 이 파일도 같이 업데이트**한다.
> 기준: 실제 `frontend/src/app/api/**/route.ts` 코드 (구현 기준).

## 공통 규칙

- 모든 응답은 JSON. 에러 응답: `{ "error": "메시지" }` + HTTP 400/401/404/500.
- 성공 상태코드는 별도 표기 없으면 200 (생성은 201).
- 금액(amount, unitPrice, revenue 등)은 **원화 정수**(예: `3000` = 3,000원).
- 운영 데이터 조회 API(dashboard·iot·tasks·sales·reports·notifications)는 현재 **인증 없이 `projectId`/`institutionId` 파라미터**로 조회한다(MVP). 세션 인증은 auth·operator-applications·upload에 적용. spaces는 인증 불요(아래 참고).

---

## 인증

### `POST /api/auth/signup` — 회원가입
- 요청: `{ "name": "...", "email": "...", "password": "...", "role": "landlord|operator" }`
- 처리: 이메일 중복 확인 → bcrypt 해시 저장 → jose 세션(JWT) 쿠키 발급. `admin`은 자가배정 불가(시드 전용).

### `POST /api/auth/login` — 로그인
- 요청: `{ "email": "...", "password": "..." }` → 성공 시 세션 쿠키 발급. 실패 401.

### `GET /api/auth/me` — 세션 유저
- 응답: `{ "user": { "id", "name", "role", "email" } | null }`

### `PATCH /api/auth/me` — 역할 확정
- 요청: `{ "role": "landlord|operator" }` → 갱신 후 세션 재서명.

### `POST /api/auth/logout` — 로그아웃 (쿠키 초기화)

---

## 공간 (건물주)

### `GET /api/spaces` — 공간 목록 / `POST /api/spaces` — 공간 등록
- 등록 요청(주요 필드): `{ spaceType, address, area, electricity, water, lighting, preferredMode, photos[] }`
- 서버가 스마트팜 적합도(`suitabilityScore`)·상태(`status`)를 관리. 정확한 필드는 `schema.prisma` model `Space` 참고.
- GET은 인증 없음(전체 목록). POST도 인증 불요 — 세션이 있으면 `ownerId`를 연결하고 없으면 `null`로 생성. (단, 폼의 사진 업로드가 쓰는 `/api/upload`는 세션 필수)

---

## 운영자

### `POST /api/operator-applications` — 운영자 지원 접수
- 요청: `{ region, cropExperience, availableHours }` (세션 유저 기준, 미인증 401). status: `applied → docs → education → matched → operating`.
- 응답: 신규 201 `{ "application": {...}, "alreadyApplied": false }`. 이미 지원한 유저(1인 1지원)는 200 `{ "application": 기존 레코드, "alreadyApplied": true }`. 필드 누락/초과 400.

### `GET /api/operator-applications` — 내 지원 이력 조회
- 세션 유저 본인의 지원 내역 반환 (미인증 401).

---

## 대시보드

### `GET /api/dashboard/[projectId]` — 지점 대시보드
- 응답:
```json
{ "project": { "id","name","location","areaSqm","status", "..." },
  "iot": { "latest": { iotData } | null, "history": [최근24h, 최대48건] },
  "esg": { "co2Reduction": 207.5, "foodMileReduction": 1245 } }
```
- `co2Reduction = areaSqm * 2.5`, `foodMileReduction = areaSqm * 15`

---

## IoT / 생육 이상 알림

### `POST /api/iot/generate` — IoT 1건 생성 + 이상탐지
- 요청: `{ "projectId": "..." }`
- 응답: `{ "data": { iotData 레코드 }, "anomaly": { "detected": bool, "score": number } }`
- 이상치면 `Notification`(type `anomaly_detected`) 자동 적재.

### `POST /api/ai/detect-anomaly` — 이상 탐지
- 요청: `{ "projectId": "..." }`
- 응답: `{ "anomalyDetected": bool, "anomalyScore": number, "affectedSensors": [...], "dataCount": number }`
- 최근 100건 대상 Z-score(>3σ) 판정. 절대 정상범위는 `src/lib/iot-health.ts`(수직농장 상추 문헌 기반).

### `GET /api/notifications?projectId=&unreadOnly=1` — 생육 이상 알림 조회
- 응답: `{ "notifications": [ { "id","projectId","type","message","isRead","createdAt" } ] }` (최신순 최대 50)

---

## 재고-생육 연동 (오늘 할 일)

### `GET /api/tasks/today?projectId=` — 오늘 할 일
- 재고 상태 + 작물 성숙 시점을 결합해 수확/보충 대상 산출. 지시·검증·근태 아님.
- 응답:
```json
{ "projectId": "...", "generatedAt": "ISO", "tasks": [
  { "type": "harvest", "productId": "...", "productName": "상추", "message": "상추 수확 시점 도래 · 재배중 120봉" },
  { "type": "restock", "productId": "...", "productName": "상추", "message": "상추 재고 부족 · 현재 4봉 보충 필요" }
] }
```
- `harvest`: `expectedHarvestAt <= now` & `growing > 0`. `restock`: `inStock < 5`.

---

## 판매-재배 연동

### `POST /api/sales` — 판매 수기입력
- 요청: `{ "projectId": "...", "productId": "...", "quantity": 7, "soldAt": "ISO"(선택) }`
- 검증: `quantity`는 양의 정수(아니면 400), `soldAt` 파싱 불가 400, `projectId`/`productId` 미존재 404.
- 처리: `amount = quantity × product.unitPrice` 기록 + **같은 트랜잭션에서 해당 품목 `Inventory.inStock`을 차감**(0 미만 방지 클램프) — '오늘 할 일'의 보충 판정이 실판매를 반영. 응답 201 `{ "record": { ... } }`.

### `GET /api/sales/trend?projectId=&days=14` — 품목별 판매 추이
- 응답:
```json
{ "projectId": "...", "periodDays": 14, "byProduct": [
  { "productId","productName","totalQuantity","totalAmount","avgDaily",
    "recommendation": "증산 검토|유지|감축 검토" }
] }
```
- 판매량 내림차순. 품목 3개 이상이면 최상위=증산 검토, 최하위=감축 검토, 나머지=유지. 3개 미만이면 전부 유지.

---

## 기관 성과 리포트

### `GET /api/reports/institution?institutionId=&days=30` — 기관 성과 집계
- 응답:
```json
{ "institution": { "id","name" }, "periodDays": 30,
  "summary": { "projectCount","operatingRate","totalHarvest","totalSalesQuantity","totalRevenue" },
  "byProject": [
    { "projectId","name","status","harvestQuantity","salesQuantity","revenue","iotRecords","anomalyRate" }
  ] }
```

---

## STO 투자·에스크로·검증

### `POST /api/subscribe` — 청약 (투자자)
- 세션 필수(투자자). `userId`는 세션(JWT)에서만 — 클라이언트 body 불신(IDOR 방지).
- 게이트: 본인인증(`identityVerified`) 완료 403, 연간 투자한도 초과 400.
- 요청: `{ projectId, tokenAmount }` (tokenAmount 양의 정수). 응답: `{ success, transaction: { txHash, amount, tokenAmount } }`.
- 잔여토큰·잔액 부족 시 400. 청약 성공 시 escrow `totalLocked`·`remaining` 증액.

### `POST /api/milestones/[id]/verify` — 마일스톤 AI 검증 (운영자/관리자)
- `requireRole("operator")` (admin도 통과). 요청: `{ milestoneType, contractImage?, receiptImage?, photoImage? }`
  (base64, `requiredSignals`에 해당하는 것만). `milestoneType`은 seq→`construction|trial_run|harvest|operation`.
- AI(OCR·비전)로 신호별 판정 + 교차검증(receipt↔photo). 전 신호 통과 시 마일스톤 `verified` + `{ passed:true, signals, txHash? }`,
  실패 시 `{ passed:false }` + 실패 알림. **강제 통과 없음.**

### `POST /api/milestones/[id]/complete` — 트랜치 집행 (운영자/관리자)
- `requireRole("operator")`. 마일스톤이 `verified` 상태여야 함(아니면 400). `releaseAmount > escrow.remaining`이면 400.
- escrow `totalReleased` 증액·`remaining` 감액, 다음 마일스톤 `in_progress`, 마지막이면 프로젝트 `operating`.
- 온체인 `releaseTranche` 호출 시 `{ txHash }` 반환(미설정 시 null).

### `POST /api/dividends/distribute` — 배당 분배 (관리자)
- `requireRole("admin")`. 요청: `{ projectId, totalRevenue }`. 워터폴(OPEX·임대·수수료·투자자배당) 산출 후 `Dividend` 생성.

---

## 데모 오케스트레이션

시연용 8스텝 자동 흐름. **모두 admin 인증 필요** — `POST /api/auth/login`(admin@farmfi.test)로 받은
쿠키 또는 body의 `token`을 `Authorization: Bearer <token>`로 전달.

### `POST /api/demo/reset` — 기준 상태 복원 (관리자)
- `seedScenario`로 전체 재시드(= `npm run seed`와 동일 데이터). `DemoCache`는 보존(cached 재생용).

### `POST /api/demo/step` — 데모 스텝 실행 (관리자)
- 요청: `{ step: 1~8, mode?: "live"|"cached" }` (mode 미지정 시 `DEMO_MODE` env, 기본 live).
- 대상 = 모집중(funding) 지점 = **3호점**. 스텝: 1~3 청약(김투자 300·이서연 200·박준혁 420 = 920구좌 완납),
  4~6 마일스톤 seq1~3 검증+집행, 7 배당, 8 마일스톤 seq4. 완납으로 escrow 13.2M 충전 → 순차 집행 시 잔여 0.
- `cached` 모드는 저장된 결과·txHash를 재생(AI·체인 재호출 없음). 성공 스텝만 캐시 저장.

---

## 파일 업로드

### `POST /api/upload` — 이미지 업로드 (매직바이트 검증, 세션 필요) → Supabase Storage URL 반환

---

## 시드 기준값 (프론트 더미/기대값 참고)

- 유저 6: `admin@farmfi.test`(admin) / `operator@farmfi.test`(정하은, operator) / `landlord@farmfi.test`(최영호, landlord) / 투자자 3명 `investor@farmfi.test`(김투자)·`investor2@farmfi.test`(이서연)·`investor3@farmfi.test`(박준혁) — 비밀번호 `farmfi123`. 투자자는 본인인증 완료·잔액 500만·연간한도 2,000만.
- 기관 1: 부산진구 도시재생지원센터(public)
- 지점 3: 온천장 1호점(83㎡, `funded` — 에스크로 1,750만·마일스톤4 집행 단계) / 장전동 2호점(66㎡, `operating`) / 명륜동 3호점(76㎡, `funding` — 청약·검증·배당 데모 대상, 에스크로 400만·마일스톤4 pending)
- 품목 3: 상추(3,000원/봉·28일) / 루꼴라(3,500·30일) / 바질(4,000·35일)
- 지점별(1·2호점): 재고 3품목, 수확·판매 14일치, IoT 60일치, 이상 알림 일부
- 리셋: `npm run seed` (CLI) 또는 `POST /api/demo/reset` (런타임) — 둘 다 `seedScenario` 공유, 앞단 deleteMany로 idempotent
