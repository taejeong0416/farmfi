# 개발 로그 (Dev Log)

> 진행상황·결정사항·인수인계 기록. **최신 항목을 맨 위에 추가(append)**한다. 이전 내용은 덮어쓰지 않는다.
> 날짜 형식: `## YYYY-MM-DD — 작성자`

---

## 2026-06-19 — 박태정

### 배경
- 사업계획서(`팜피_FarmFi_사업계획서_B301_최종.md`)와 plan·코드를 대조 → 3종류 불일치 발견.
- **확인 결과 `코드 == plan.md`이고 둘 다 사업계획서와 달랐음.** 방향 결정: 사업계획서를 기준으로 plan+코드 전부 정합(전부 맞춤).

### 한 일 — 사업계획서 기준 정합 (커밋 5개, 각 단계 `tsc --noEmit` 통과)
- **정산 구조** (`0153a7b`): OPEX 140→100만(전기60+재료40), 건물주 매출22%→**월 고정 임대료 50만(매출 무관)**, 플랫폼 수수료 10%→**1.5%**(표13), **설비파트너 DRB 정산 분배 제거**(설비공급·자문 협력사로만), 운영자 기본급 제거. `waterfall.ts`/`dividends/distribute`(파트너 회수 블록 삭제)/seed/reset/plan L2-4-4·admin.
  - 워터폴 출력 키 변경: `{opex, landlordRent, platformFee, investorDividend, operatorResidual, breakdown}`.
- **시드 숫자** (`ecf3543`): CAPEX 3000만→**1,750만**(=모집목표), 토큰가 5천→**1만원**, 총 1000→**1,750토큰**, 면적 50㎡→**25평(83㎡)**, 마일스톤 612.5/525/350/262.5만, M1 자산가치 1800→1,050만, 작물 엽채류→**새싹삼**. 데모 청약 500/250/1000, 정산 매출 297만. seed/reset/demo-step/iot-seed/plan.
- **검증 신호(표3)** (`47231ee`): M2 `[photo,iot]`→`[iot]`(센서 단독), M3 `[photo,receipt,iot]`→`[photo,receipt]`, M4 `[iot,receipt,photo]`→`[iot,receipt]`. conditionText·데모 mock 매핑(M2 무이미지, receipt-2=판매 영수증). seed/reset/demo-step/plan.
- **참조 문서** (`ca33655`): api-spec 워터폴 응답 키·시드 기준값, dev-report ProjectPartner·waterfall에서 DRB 제거.

### 미해결 / 다음 할 일
- **DB 재시드 필요**: seed 코드만 바뀌어 실행 중 DB엔 옛 값이 남아 있음 → `cd frontend && npm run seed && npm run seed:iot` (스키마 불변이라 push 불필요).
- **mock 이미지**: `public/demo/` 미생성 상태. 필요분 축소됨 — mock-contract(83㎡/25평 표기), mock-receipt-1(설비), mock-receipt-2(**판매**), mock-photo-1, mock-photo-3, 실패용 mock-receipt-fail. (시운전·운영 사진 불필요)
- `schema.prisma` ProjectPartner.role 주석에 `equipment_partner` 잔존 — 모델은 그대로 둠(향후 실서비스 여지). 시드에선 미사용.

---

## 2026-06-11 — 박태정

### 전체 점검 결과 (코드 리뷰)
- 컨트랙트 테스트 13개 재실행 → 전부 통과. `tsc --noEmit` 통과.
- ⚠️ **DB 연결 깨짐 확인**: dev 서버에서 실호출 시 `tenant/user not found` — Supabase 프로젝트 일시정지(무료 티어 자동 정지) 또는 연결 문자열 오류로 추정. **다음 작업자: Supabase 대시보드에서 프로젝트 Restore 후 connection string 재확인 필요.**
- ⚠️ `next build`는 Windows + 한글 경로(`D:\해커톤`)에서 EISDIR 에러로 실패 (tsc는 통과 — 코드 문제 아님). Vercel(Linux)에선 괜찮을 가능성 높으나 조기 배포로 확인 권장.

### 한 일 (DB 연결 없이 수정 가능한 버그 일괄 수정)
- **컨트랙트** (`forge test` 17/17 통과):
  - Escrow: refund에 projectFailed 게이트(markFailed) 추가, 환불 시 totalLocked/remaining 차감, 첫 해제 후 청약 차단
  - Deploy.s.sol: msg.sender 대신 PRIVATE_KEY에서 배포자 유도 (DEFAULT_SENDER 오배정 방지)
- **P0 (데모 차단 버그)**:
  - complete: `userId: "system"` FK 위반 → Transaction.userId optional화 (트랜치 해제가 항상 500 나던 버그)
  - verify: iot 신호가 없는 필드(`data.passed`) 참조 → 마일스톤 3이 항상 실패하던 버그 수정
  - demo/step: 이미지 파일명을 base64인 척 전달 + 실패 시 강제 verified 처리 → 실제 base64 로드 + 강제 통과 제거 (**mock 이미지 + API 키 준비 전까지 데모 스텝 4~8은 검증 실패가 정상**)
  - demo/reset: IoT·NAV 재시드 누락 → `src/lib/iot-seed.ts` 공용 모듈로 추가
  - detect-anomaly: 가동률을 iotMinDays 기간 기준으로 + 데이터 0건 자동 통과 차단
- **P1 (검증 고도화)**:
  - verify-contract: 프로젝트 주소·면적(±20%) 대조 / verify-receipt: conditionText 부합 판단
  - verify: crossCheck(영수증↔사진 설비 카테고리 매칭) + 실패 시 Notification 생성
  - ai-cache: DemoCache 오용 버그 → 전용 AiCache 모델 + vision 라우트 3종 연결
  - waterfall: 운영자 기본급 이중 차감 제거 + 순차 차감 / dividends: 자동 클레임(잔액 반영)
- **plan.md 보강**: L2-4-6 온체인 연동 모듈 신설, 실패용 mock 이미지 추가, NEXT_PUBLIC_BASE_URL·EISDIR 메모, Dividend 스냅샷 한계 등 L1-11 항목 추가

### 미해결 / 다음 할 일
- Supabase 복구 → `prisma db push`(AiCache 모델 추가됨) → seed → API 실동작 확인
- OPENAI/ANTHROPIC 키 + mock 이미지 준비 → AI 검증 실테스트 (이제 진짜로 거부/통과가 갈림)
- 컨트랙트 Amoy 배포 (PRIVATE_KEY 필요) → L2-4-6 온체인 연동
- 프론트엔드 페이지 전체 미착수 (가장 큰 일정 리스크)

---

## 2026-06-07 (2) — 박태정

### 한 일
- Prisma 7 빌드 막힘 **해결** — driver adapter(`@prisma/adapter-pg`) 방식으로 셋업 완성. `tsc --noEmit` 에러 0개.
- 방향 변경 메모: 처음엔 클래식 generator 복귀(A안)로 가려 했으나, 프로젝트가 이미 어댑터 방식(스키마에서 url 제거 + `prisma.config.ts`)으로 셋업돼 있어 **그 방향을 완성하는 쪽**으로 바꿈.

### 해결됨 (이전 "미해결" 항목)
- ✅ `new PrismaClient()` 인자 누락 / import 경로 / tsconfig target / `Set` 순회 — 전부 해결.

### 남음
- 런타임 DB 연결은 실제 `DATABASE_URL`로 1회 확인 필요 (tsc는 통과, 실연결은 미검증).
- 프론트 기반 세팅(패키지·shadcn·wagmi), 컨트랙트 Amoy 배포는 그대로 대기.

---

## 2026-06-07 — 박태정

### 한 일
- `docs/api-spec.md` 작성 — API 15개 요청/응답 명세 (실제 route.ts 코드 기준, 공유·갱신용)
- `plan.md`(구 세부플랜.md)에 `L1-11. 실서비스 확장 항목` 추가 (인증/결제/KYC 등 — 해커톤 이후 개발, 중요도는 높음)
- 백엔드 버그 3개 수정:
  - `verify` → AI API 호출 키 `image` → `imageBase64` (실검증이 항상 실패하던 버그)
  - `detect-anomaly`: `prisma.ioTData`→`iotData`, `createdAt`→`recordedAt`
  - `demo/step`: `milestoneType` seq별 영문 enum 매핑
- `.gitignore`에 `.env` 추가 (시크릿 커밋 방지)
- Prisma 임포트 경로 `@/generated/prisma` → `@/generated/prisma/client` (모듈 해석 에러 해결)
- 팀 공유 문서 체계 수립 (이 로그 + `docs/README.md` 인덱스, 백엔드 보고서 docs/로 이동)

### 결정
- 문서 운영 방식: **용도별 분리 + git 아카이브** (레퍼런스는 제자리 갱신, 진행상황은 이 로그에 append, 수동 아카이빙 X)
- 도커 미사용 확정 — Vercel + Supabase 조합 유지
- Prisma 빌드 문제는 **A안(`prisma-client-js` generator로 전환)**으로 처리하기로 결정 → 다음 작업

### 미해결 / 다음 할 일
- ⚠️ **빌드 막힘**: Prisma 7 새 generator라 `new PrismaClient()`에 인자 필요. → `schema.prisma` generator를 `prisma-client-js`로 변경 + `tsconfig` target 추가 예정 (detect-anomaly의 `Set` 순회 에러도 같이 해결됨)
- 프론트 기반 세팅(패키지 설치, shadcn, wagmi) — 프론트 담당 착수 가능
- 컨트랙트 Amoy 미배포 → 온체인 응답 `txHash`는 아직 전부 `null`
