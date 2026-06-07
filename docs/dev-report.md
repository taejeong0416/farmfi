# FarmFi 백엔드 구현 보고서

> 작성일: 2026-06-02 | 작성자: 박태정 (백엔드)
> 목적: 팀원 공유 — 현재 어디까지 됐는지, 다음에 뭘 해야 하는지

---

## 한줄 요약

**스마트컨트랙트 3개 + API 15개 + DB 스키마 + 시드 데이터**를 모두 작성하고 GitHub에 푸시했습니다.
아직 실제 DB 연결과 블록체인 배포는 안 된 상태이고, 이 부분은 환경설정 후 바로 가능합니다.

---

## 1. 완료된 작업

### 1-1. 스마트컨트랙트 (Solidity)

블록체인 위에서 돌아가는 코드 3개를 작성했습니다. 이 코드들이 **"사람이 임의로 자금을 빼갈 수 없다"**는 것을 기술적으로 보장합니다.

| 컨트랙트 | 역할 | 파일 |
|---|---|---|
| **FarmToken** | 프로젝트 토큰 발행 (투자 지분) | `contracts/src/FarmToken.sol` |
| **Escrow** | 투자금 보관 + 마일스톤별 자금 해제 | `contracts/src/Escrow.sol` |
| **Dividend** | 수익금을 토큰 보유 비율대로 배당 | `contracts/src/Dividend.sol` |

**검증 명제와의 대응:**

| 검증 명제 | 어떻게 보장되나 | 테스트 통과 여부 |
|---|---|---|
| ① 마일스톤 미달 시 자금 안 풀림 | Escrow 코드에서 `verified == true`가 아니면 실행 자체가 불가능 | ✅ 통과 |
| ② 사람이 강제로 자금 풀기 불가 | AI 검증 역할(VERIFIER_ROLE)만 검증 가능, 관리자도 직접 해제 불가 | ✅ 통과 |
| ③ 마일스톤 통과 시 자동 집행 | 검증 통과하면 누구나 해제 트랜잭션 실행 가능 (추가 승인 불필요) | ✅ 통과 |

자동화된 테스트 13개를 작성했고, **전부 통과**했습니다.

---

### 1-2. 데이터베이스 (Prisma 스키마)

서비스에 필요한 데이터 구조 13개를 정의했습니다.

| 모델 | 설명 |
|---|---|
| User | 투자자, 건물주, 운영자 정보 |
| Project | 미니팜 프로젝트 (목표금액, 토큰가격, 상태 등) |
| Escrow | 에스크로(금고) 현황 |
| Milestone | 마일스톤 4단계 (검증 상태, 필수 신호, 재시도 횟수) |
| Transaction | 모든 거래 내역 (청약, 해제, 배당) |
| TokenHolding | 누가 몇 개 토큰 보유 중인지 |
| Dividend / DividendClaim | 배당 내역 + 수령 기록 |
| IotData | IoT 센서 데이터 (온도, 습도, CO2, 광량, pH) |
| Notification | 관리자 알림 (검증 실패, 이상 탐지) |
| ProjectPartner | 참여 주체 (DRB동일, 건물주) |
| NavSnapshot | 토큰 가치(NAV) 일별 기록 |
| DemoCache | 데모 재생용 캐시 |

**파일 위치:** `frontend/prisma/schema.prisma`

---

### 1-3. 시드 데이터 (데모용 초기 데이터)

| 데이터 | 내용 | 파일 |
|---|---|---|
| 기본 시드 | 사용자 5명, 프로젝트 1개, 마일스톤 4개, 파트너 2개 | `prisma/seed.ts` |
| IoT 시드 | 60일치 센서 데이터 2,880건 + NAV 스냅샷 60일 | `prisma/seed-iot.ts` |

**시드 사용자:**
- 투자자: 김민수(잔액 500만), 이서연(300만), 박준혁(1000만)
- 건물주: 최영호
- 운영자: 정하은

---

### 1-4. API (서버 기능 15개)

프론트엔드에서 호출하는 서버 기능을 전부 만들었습니다.

**핵심 플로우:**

| API | 하는 일 |
|---|---|
| `GET /api/projects` | 프로젝트 목록 보여주기 |
| `GET /api/projects/[id]` | 프로젝트 상세 정보 |
| `POST /api/subscribe` | 투자자가 토큰 구매 (청약) |
| `POST /api/milestones/[id]/verify` | AI가 마일스톤 검증 |
| `POST /api/milestones/[id]/complete` | 검증 통과 후 자금 해제 |
| `POST /api/dividends/distribute` | 매출 정산 + 배당 분배 |

**AI 검증 (4개):**

| API | 하는 일 |
|---|---|
| `POST /api/ai/verify-receipt` | 영수증 사진 → AI가 금액/항목 추출 |
| `POST /api/ai/verify-contract` | 임대차 계약서 → AI가 주소/면적 추출 |
| `POST /api/ai/verify-photo` | 현장 사진 → AI가 설비/작물 인식 |
| `POST /api/ai/detect-anomaly` | IoT 센서 이상 자동 탐지 |

**부가 기능:**

| API | 하는 일 |
|---|---|
| `GET /api/dashboard/[projectId]` | 대시보드 데이터 집계 |
| `POST /api/iot/generate` | IoT 데이터 1건 생성 + 이상 탐지 |
| `POST /api/demo/step` | 데모 자동재생 (8단계) |
| `POST /api/demo/reset` | 데모 초기화 |
| `POST /api/admin/notify` | 관리자 알림 생성 |

---

### 1-5. 공통 유틸리티 (7개)

| 파일 | 역할 |
|---|---|
| `nav-calculator.ts` | 토큰 현재 가치(NAV) 실시간 계산 |
| `waterfall.ts` | 매출 워터폴 배분 (운영비 → 건물주 → DRB → 투자자 → 운영자) |
| `anomaly-detector.ts` | Z-score 기반 IoT 이상 탐지 |
| `format.ts` | 금액/날짜/해시 표시 포맷 |
| `constants.ts` | 상태값 상수 정의 |
| `demo-mode.ts` | 데모 모드(실제/캐시) 관리 |
| `ai-cache.ts` | AI 검증 결과 캐시 (시연 안정성) |

---

## 2. 커밋 이력

총 8개 커밋을 순서대로 푸시했습니다.

```
dd7f42d  Foundry 프로젝트 초기화 + OpenZeppelin 설치
640e94d  FarmToken.sol - ERC-20 기반 프로젝트 토큰
fc903aa  Escrow.sol - 마일스톤 기반 에스크로 컨트랙트
8a5418a  Dividend.sol - 토큰 보유 비례 배당 분배
7a20c65  스마트컨트랙트 테스트 13개 + 배포 스크립트
a49663c  Next.js 14 프로젝트 + Prisma 스키마 + DB 설정
0b3a7f9  공통 유틸리티 + 시드 데이터
6c6b433  API Routes 15개 전체 구현
```

---

## 3. 아직 안 된 것 (다음 할 일)

| 순서 | 할 일 | 누가 | 비고 |
|---|---|---|---|
| **1** | Supabase DB 연결 | 백엔드 | `.env`에 DATABASE_URL 설정 → `npx prisma db push` |
| **2** | 시드 데이터 넣기 | 백엔드 | `npx prisma db seed` |
| **3** | Polygon Amoy 컨트랙트 배포 | 백엔드 | 테스트넷 MATIC 필요 (무료 faucet) |
| **4** | OpenAI + Anthropic SDK 설치 | 백엔드 | `npm i openai @anthropic-ai/sdk` |
| **5** | 프론트엔드 페이지 개발 | 프론트 | 랜딩, 프로젝트, 대시보드, 데모, 관리자 |
| **6** | Web3 연동 (wagmi/RainbowKit) | 프론트 | 지갑 연결 + 온체인 트랜잭션 UI |
| **7** | mock 증빙 이미지 준비 | 기획/디자인 | 계약서, 영수증, 현장사진 |
| **8** | 데모 전체 테스트 | 전체 | 8단계 + 실패 케이스 3개 |

---

## 4. 프론트엔드 담당에게

### API 호출 방법

모든 API는 `/api/...` 경로로 fetch하면 됩니다.

```typescript
// 예시: 프로젝트 목록 가져오기
const res = await fetch("/api/projects");
const { projects } = await res.json();

// 예시: 청약하기
const res = await fetch("/api/subscribe", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: "...", projectId: "...", tokenAmount: 100 }),
});
```

### 환경 설정

`frontend/.env.example`을 복사해서 `.env.local`로 만들고 값 채우면 됩니다.

```
DATABASE_URL="postgresql://..."    ← Supabase 연결 문자열
OPENAI_API_KEY="sk-..."           ← GPT-4o 키
ANTHROPIC_API_KEY="sk-ant-..."    ← Claude 키
NEXT_PUBLIC_AMOY_RPC="https://rpc-amoy.polygon.technology"
```

---

## 5. 파일 구조 요약

```
pnuai-b-01-b301/
├── contracts/                    ← 스마트컨트랙트 (Solidity)
│   ├── src/
│   │   ├── FarmToken.sol         토큰 발행
│   │   ├── Escrow.sol            에스크로 + 마일스톤
│   │   └── Dividend.sol          배당 분배
│   ├── test/                     테스트 13개
│   └── script/Deploy.s.sol       배포 스크립트
│
└── frontend/                     ← Next.js 웹 앱
    ├── prisma/
    │   ├── schema.prisma         DB 스키마 (13개 모델)
    │   ├── seed.ts               기본 시드 데이터
    │   └── seed-iot.ts           IoT 시드 데이터
    ├── src/
    │   ├── app/api/              API 15개
    │   │   ├── projects/         프로젝트 목록/상세
    │   │   ├── subscribe/        청약
    │   │   ├── milestones/       검증 + 트랜치 해제
    │   │   ├── dividends/        배당
    │   │   ├── ai/               AI 검증 4종
    │   │   ├── dashboard/        대시보드 집계
    │   │   ├── iot/              IoT 생성
    │   │   ├── demo/             데모 자동재생/리셋
    │   │   └── admin/            관리자 알림
    │   └── lib/                  유틸리티 7개
    └── .env.example              환경변수 템플릿
```
