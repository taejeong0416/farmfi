# FarmFi API 명세서

> 프론트 ↔ 백엔드 공유 문서. **API가 바뀌면 이 파일도 같이 업데이트**한다.
> 기준: 실제 `frontend/src/app/api/**/route.ts` 코드 (구현 기준).

## 공통 규칙

- 모든 응답은 JSON. 에러 응답: `{ "error": "메시지" }` + HTTP 400/401/404/500.
- 성공 상태코드는 별도 표기 없으면 200 (생성은 201).
- 금액(amount, unitPrice, revenue 등)은 **원화 정수**(예: `3000` = 3,000원).
- 운영 데이터 조회 API(dashboard·iot·tasks·sales·reports·notifications)는 현재 **인증 없이 `projectId`/`institutionId` 파라미터**로 조회한다(MVP). 세션 인증은 auth·spaces·operator-applications·upload에 적용.

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

---

## 운영자

### `POST /api/operator-applications` — 운영자 지원 접수
- 요청: `{ region, cropExperience, availableHours }` (세션 유저 기준). status: `applied → docs → education → matched → operating`.

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
- 처리: `amount = quantity × product.unitPrice`. 응답 201 `{ "record": { ... } }`.

### `GET /api/sales/trend?projectId=&days=14` — 품목별 판매 추이
- 응답:
```json
{ "projectId": "...", "periodDays": 14, "byProduct": [
  { "productId","productName","totalQuantity","totalAmount","avgDaily",
    "recommendation": "증산 검토|유지|감축 검토" }
] }
```
- 판매량 내림차순. 최상위=증산, 최하위=감축, 나머지=유지.

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

## 파일 업로드

### `POST /api/upload` — 이미지 업로드 (매직바이트 검증, 세션 필요) → Supabase Storage URL 반환

---

## 시드 기준값 (프론트 더미/기대값 참고)

- 유저 3: `admin@farmfi.test`(admin) / `operator@farmfi.test`(정하은, operator) / `landlord@farmfi.test`(최영호, landlord) — 비밀번호 `farmfi123`
- 기관 1: 부산진구 도시재생지원센터(public)
- 지점 2: 온천장 스마트팜 1호점(부산 동래구, 83㎡) / 장전동 스마트팜 2호점(부산 금정구, 66㎡) — 둘 다 `operating`, 기관 소속
- 품목 3: 상추(3,000원/봉·28일) / 루꼴라(3,500·30일) / 바질(4,000·35일)
- 지점별: 재고 3품목, 수확·판매 14일치, IoT 60일치(2,880건, ~2% 이상치), 이상 알림 일부
- 리셋: `npm run seed` (앞단 deleteMany로 idempotent)
