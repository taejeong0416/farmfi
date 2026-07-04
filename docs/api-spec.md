# FarmFi API 명세서

> 프론트 ↔ 백엔드 공유 문서. **API가 바뀌면 이 파일도 같이 업데이트**한다.
> 기준: 실제 `frontend/src/app/api/**/route.ts` 코드 (플랜이 아니라 구현 기준).
> 최종 갱신: 2026-06-07

## 공통 규칙

- 모든 응답은 JSON.
- 금액(amount, balance, tokenPrice 등)은 **원화 정수**(예: `5000` = 5,000원). 내부적으로 BigInt지만 응답에선 Number로 직렬화됨.
- 에러 응답 형식: `{ "error": "메시지" }` + HTTP 상태코드(400/404/500).
- 성공 상태코드는 별도 표기 없으면 200.

## ⚠️ 프론트 담당 필독 — 현재 구현 주의사항

1. **온체인 미연동**: `subscribe`, `verify`, `complete`, `dividends/distribute` 응답의 `txHash`는 **현재 전부 `null`**이다. 컨트랙트 Amoy 배포 + 연동 전까지 DB만 갱신됨. Polygonscan 링크 UI는 만들되 `txHash`가 null이면 "대기/모의" 표시 처리할 것.

> 과거 있던 버그(AI 검증 `image`/`imageBase64` 키 불일치, IoT 이상탐지 모델 접근자, 데모 milestoneType)는 모두 수정됨. 현재 응답 스키마 그대로 신뢰하고 진행하면 됨.

---

## 프로젝트

### `GET /api/projects` — 프로젝트 목록
- 요청: 없음
- 응답:
```json
{ "projects": [
  {
    "id": "...", "name": "금정구 미니팜 1호", "location": "...",
    "tokenSymbol": "MF01", "tokenPrice": 5000,
    "totalTokens": 1000, "soldTokens": 0,
    "targetAmount": 5000000, "currentAmount": 0, "status": "funding",
    "escrow": { "...": "..." },
    "milestones": [ { "...": "..." } ],
    "fundingPercent": 0,
    "investorCount": 0
  }
] }
```
- `fundingPercent = currentAmount / targetAmount * 100` (계산해서 내려줌)

### `GET /api/projects/[id]` — 프로젝트 상세
- 응답: project 객체 + `escrow` + `milestones`(seq 오름차순) + `tokenHoldings` + `transactions`(최근 10건). 없으면 404.

---

## 청약

### `POST /api/subscribe` — 토큰 청약
- 인증: 세션(JWT) 필수 — userId는 항상 세션에서 읽음 (클라이언트가 보낸 값 무시)
- 요청: `{ "projectId": "...", "tokenAmount": 200 }`
- 검증:
  - 미로그인 → 401 "Unauthorized"
  - 본인인증 미완료 → 403 "Identity verification required"
  - 연간 투자한도(User.investorAnnualLimit) 초과 → 400 "Annual investment limit exceeded" (올해 청약 누적 + 이번 금액 기준)
  - 잔액 부족 → 400 "Insufficient balance" / 토큰 초과 → 400 "Not enough tokens available"
- 응답:
```json
{ "success": true,
  "transaction": { "txHash": null, "amount": 1000000, "tokenAmount": 200 } }
```
- 처리: user.balance 차감, project.soldTokens·currentAmount 증가, escrow 갱신, tokenHolding upsert, transaction 생성. 목표 달성 시 status `funded`. (핵심 로직은 `src/lib/subscription.ts` — 데모 `demo/step`은 이 lib을 직접 호출하는 신뢰 경로라 인증·한도 게이트 없음)

---

## 마일스톤

### `POST /api/milestones/[id]/verify` — AI 검증
- 요청: `{ "contractImage": "base64", "receiptImage": "base64", "photoImage": "base64", "milestoneType": "..." }`
  - 마일스톤의 `requiredSignals`에 있는 신호만 검증함 (없는 이미지는 안 보내도 됨)
- 응답:
```json
{ "passed": true, "signals": { "contract": true, "receipt": true, "photo": true },
  "retryCount": 0, "txHash": null }
```
- 전부 통과 → milestone.status `verified`. 실패 → retryCount++, 2회째 실패 시 `manual_review`.

### `POST /api/milestones/[id]/complete` — 트랜치 해제
- 요청: 본문 없음 `{}`
- 전제: milestone.status가 `verified`여야 함 (아니면 400). `manual_review`면 400.
- 응답: `{ "success": true, "milestone": {...}, "txHash": null }`
- 처리: status `completed`, escrow.totalReleased 증가·remaining 감소, 다음 마일스톤 `in_progress`, 전부 완료 시 project.status `operating`.

---

## 배당

### `POST /api/dividends/distribute` — 월 정산 + 배당
- 요청: `{ "projectId": "...", "totalRevenue": 2970000 }`
- 응답:
```json
{ "waterfall": {
    "opex": 0, "landlordRent": 0, "platformFee": 0,
    "investorDividend": 0, "operatorResidual": 0, "breakdown": []
  },
  "dividend": { "id": "...", "perToken": 0, "period": "2026-06", "...": "..." },
  "txHash": null }
```
- (waterfall 정확한 키는 `src/lib/waterfall.ts` 참고)

---

## AI 검증 (하위 API — 보통 프론트가 직접 호출 X, verify가 호출)

### `POST /api/ai/verify-receipt`
- 요청: `{ "milestoneId": "...", "imageBase64": "..." }`
- 응답: `{ "passed": bool, "extractedData": { "amount", "items", "date" }, "confidence": 0.9, "reason": "..." }`

### `POST /api/ai/verify-contract`
- 요청: `{ "milestoneId": "...", "imageBase64": "..." }`
- 응답: `{ "passed": bool, "extractedData": { "landlord","tenant","address","areaSqm","period","rent" }, "confidence", "reason" }`

### `POST /api/ai/verify-photo`
- 요청: `{ "milestoneId": "...", "imageBase64": "...", "milestoneType": "construction|trial_run|harvest|operation" }`
- 응답: `{ "passed": bool, "detectedObjects": [...], "confidence", "reason" }`

### `POST /api/ai/detect-anomaly`
- 요청: `{ "projectId": "...", "milestoneId": "..."(선택) }`
- 응답: `{ "anomalyDetected": bool, "anomalyScore": 0, "affectedSensors": [...], "uptimeRate": 100|undefined }`
- `milestoneId`의 마일스톤이 `iotMinDays > 0`이면 `uptimeRate` 포함.

---

## IoT

### `POST /api/iot/generate` — IoT 데이터 1건 생성 + 이상탐지
- 요청: `{ "projectId": "..." }`
- 응답: `{ "data": { iotData 레코드 }, "anomaly": { "detected": bool, "score": number } }`

---

## 대시보드

### `GET /api/dashboard/[projectId]` — 대시보드 통합 데이터
- 응답:
```json
{ "project": {...}, "escrow": {...}, "milestones": [...],
  "transactions": [최근10건], "tokenHoldersCount": 0, "dividends": [...],
  "iot": { "latest": {...}, "history": [최근24h, 최대48건] },
  "navSnapshots": [...],
  "nav": { /* nav-calculator.ts 반환값 */ },
  "esg": { "co2Reduction": 125, "foodMileReduction": 750 } }
```
- `co2Reduction = areaSqm * 2.5`, `foodMileReduction = areaSqm * 15`

---

## 관리자

### `POST /api/admin/notify` — 검증 실패 알림 생성
- 요청: `{ "milestoneId": "...", "failureReason": "...", "evidenceUrl": "..."(선택), "retryCount": 1 }`
- 응답: `{ "success": true }`

---

## 데모

### `POST /api/demo/reset` — DB 초기화 + 재시드
- 요청: 본문 없음
- 응답: `{ "success": true, "message": "Demo reset complete" }`
- `DemoCache`는 보존(캐시 모드 유지). 사용자 5명 + 프로젝트 1개 + 에스크로 + 마일스톤 4개 + 파트너 2개 재생성.

### `POST /api/demo/step` — 데모 단계 실행
- 요청: `{ "step": 1~8 }`
- step: 1~3 청약(김민수200/이서연150/박준혁650), 4~6·8 마일스톤 검증+해제(seq 1,2,3,4), 7 배당
- 응답: `{ "step": 1, "status": "completed", "result": {...}, "fromCache": true? }`
- `DEMO_MODE=cached`면 캐시된 결과 즉시 반환(`fromCache: true`).

---

## 시드 기준값 (프론트 더미/기대값 참고)

- 투자자: 김민수(잔액 500만), 이서연(300만), 박준혁(1000만) / 건물주 최영호 / 운영자 정하은
- 프로젝트: 금정구 미니팜 1호, MF01, 토큰가 10,000원, 총 1,750개, 목표 1,750만원, CAPEX 1,750만원, 면적 25평(≈83㎡), 작물 새싹삼
- 마일스톤 4개: 공간준비(35%, 612.5만, 계약서+영수증+사진) / 시운전(30%, 525만, IoT14일) / 첫수확(20%, 350만, 사진+영수증) / 지속운영(15%, 262.5만, IoT60일+영수증)
- 파트너: 건물주 최영호 (월 고정 임대료 50만)
