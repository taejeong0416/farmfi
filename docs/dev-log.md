# 개발 로그 (Dev Log)

> 무엇을 했고 왜 그렇게 결정했는지를 남기는 **작업 기록**. **최신을 맨 위에** 쓰고, 끝난 항목은 자유롭게 압축·정리한다 (전체 이력은 git).
> 날짜 형식: `## YYYY-MM-DD — 작성자`

---

## 2026-08-17 — 박태정

### 웹 명세 미구현분 — 백엔드층을 먼저 끝낸다
`feature-spec.md`와 코드를 대조해 남은 개발을 갈랐다. 기준은 **프론트 UI 시안 없이 확정할 수 있는가**다. 화면 5개(목록 검색·필터, 리스크 고지 섹션, 청약 취소·연결 계좌·배당 캘린더, 운영자 증빙 제출, 알림 설정)는 시안을 받은 뒤로 미루고, 스키마 변경이 걸린 다섯 항목을 먼저 끝냈다. 마이그레이션이 발표 직전에 몰리는 것을 피하려는 순서다. (UI 대기 목록은 바탕화면 `farmfi-web-ui-pending.md`)

- **스키마 5모델**: `AuditLog`(FK 없이 값만 — 대상 행이 지워져도 기록은 남는다)·`SettlementRule`(프로젝트별 override)·`Appeal`/`AppealComment`·`Payout`. 겸해서 `Project.operatorId`와 `ProjectPartner.userId` — 운영자 몫·임대료를 누구에게 지급할지 알 수 없었다. 세션 pooler(5432) additive push.
- **감사 추적**(명세 2.5): `recordAudit`은 기록 실패가 청약·트랜치 집행을 롤백시키지 않게 예외를 삼킨다(트랜잭션 클라이언트를 넘긴 경로는 전파). `GET /api/audit-logs`에 기간·프로젝트·사용자·이벤트 필터 + 커서 페이징 + CSV(UTF-8 BOM — Excel 한글). 청약·검증·반려·집행·기한초과·배당·환불·알림에 배선.
- **정산 규칙**(2.1·2.1.1): `waterfall.ts` 하드코딩 상수를 `DEFAULT_*` 기본값으로 내리고 `resolveSettlementRule`이 프로젝트 규칙을 읽는다(규칙 없으면 기존 수치 그대로). 우선배분·전환은 기간 매출과 `breakEvenRevenue` 비교로 적자/흑자 배분율을 고른다. `FeePoolResult`에 `rule·band·investorShare`를 실어 화면이 판정 근거를 보여줄 수 있게 했다.
- **이의제기**(1.3·1.3.1): 보류·반려 건에만 접수, 마일스톤당 미결 1건. `review → escalate → approve/reject` 전이를 조건부 `updateMany`로 원자화. 인정되면 `manual_review` 마일스톤을 `in_progress`·retry 0으로 되돌려 재검증 경로를 연다(기한초과 `failed`는 환불 절차라 손대지 않음). 외부 전문가는 계정 역할이 없어 admin이 `asRole=auditor`로 대신 기록한다.
- **프로젝트 승인·중지**(2.4.1): 사유 필수. `resume` 복귀 상태는 저장값이 아니라 현재 사실관계(모집 마감·완판·마일스톤 완료)에서 유도한다 — 저장한 이전 상태와 실제 진행도가 어긋나는 경우를 없애려고. `completed`·`failed`는 이 경로로 되돌리지 않는다(정산·환불 절차와 어긋남).
- **지급 원장**(2.2·2.2.1): 실 이체는 범위 밖이라 예정/완료/실패 상태와 증빙만 다룬다 — 잔액은 건드리지 않는다(즉시 지급은 `dividends/distribute`가 담당). 배당(구좌 비례)·임대료(파트너 월 고정)·운영자 정산(매출 − 이용료 − 임대료) 3항목. 유니크 제약으로 재호출이 안전하고, `format=csv`가 명세의 '지급 파일'이다.

### 스모크에서 잡힌 것
`tsc`만으로는 안 보이는 것들이 실호출에서 나왔다. dev 서버 + admin Bearer로 신규 라우트 전부 왕복(상태를 원위치로 되돌리는 시나리오만) 후 흔적 정리.
- **이의제기가 통과한 마일스톤에도 열렸다**: `retryCount>0`만 봐서, 1회 실패 후 재검증을 통과한 `verified` 건이 접수 대상에 들어갔다. `verified`·`completed` 제외로 수정.
- **운영자 정산 라인이 안 생겼다**: 코드가 아니라 데이터 — 시드가 돌던 시점엔 `Project.operatorId`가 없어 기존 행이 전부 null이었다. 시드 정의와 같은 값(정하은)으로 백필하고 재확인 → `매출 1,400,000 − 이용료 200,000 − 임대료 500,000 = 700,000` 생성.
- **구간 전환 확인**: `breakEvenRevenue=1,400,000`·적자 0.8 규칙에서 매출 100만 → `band=deficit`, 배당 262,857(= 풀 328,571 × 0.8). 규칙 삭제 후 기본값 0.6 복귀도 확인.
- 가드 확인: 사유 없는 중지·최종판정, 1 초과 비율, 잘못된 상태 전이, 중복 이의제기, 완료 건 재지급 — 전부 4xx.

---

## 2026-08-14 — 박태정

### 문서 정리 — 확정 명세만 남긴다
`docs/`가 11개까지 늘면서 무엇이 현재 기준인지 흐려져 있었다. 확정된 기능명세서·유저플로우를 `feature-spec.md`·`user-flow.md`로 들이고, 나머지를 정리해 3개로 줄였다.

기준은 **개발할 때 무엇을 만들지 보는 문서인가**다. 남긴 둘은 만들 대상을 정의하고, 뺀 것들은 이미 만든 것을 서술한다. 후자는 코드가 앞서가면 그 순간 틀린 문서가 되고, 실제로 `api-spec.md`는 07-21 기준에 멈춰 그 뒤 추가된 라우트가 빠져 있었다. 구현의 현재 상태는 코드가 답한다.

- **제거(기획 단계)**: `onboarding.md`(설계 근거 서술), `service-plan.md`·`sto-plan.md`(사업 기획안), `fusion-plan.md`(STO 재융합 실행계획, Phase 1~4 `main` 병합 완료), `dev-assessment.md`(08-03 기준 제출 보고서 스냅샷).
- **제거(구현 서술)**: `api-spec.md`, `verification-spec.md`, `optimization-roadmap.md`, `opendid-verifier-연동.md`. 내용은 git history에 있다.
- **참조 정리**: `README`·`CONTRIBUTING`·`CLAUDE.md`·`docs/README`의 진입 문서를 명세서·유저플로우로 교체. `identity/verifier.ts`의 연동 가이드 포인터도 제거(파일 상단 주석에 연동 방식이 이미 적혀 있다).

남은 `docs/`는 확정 명세 2종과 기록 `dev-log` 하나.

---

## 2026-08-03 — 박태정

### 생육 모니터링 — 광량을 일적산으로, 생장을 환경의 함수로
"생장 모니터링"인데 화면이 전부 환경 센서값이었고, 광량 판정이 최적화와 정면으로 충돌하고 있었다. 실데이터가 없다는 제약이 오히려 순서를 정했다 — 탐지기를 더 만들기 전에 **시드가 탐지기가 잡을 현상을 담고 있는지**부터 봐야 했다.

- **시드 시나리오화**(`iot-seed.ts`): 기존 시드는 2% 무작위 단발 스파이크뿐이라 CUSUM은 탐지할 대상이 없고 DLI는 매일 같은 값이었다. 세 고장을 시간축에 심음 — 12~18일차 냉방 저하(하루 +0.6℃, CUSUM만 잡음) / 30일차 펌프 막힘(pH 4.2, Z-score+게이트) / 45일차~ LED 열화(−28%, DLI만 잡음). `growthRate`를 날짜 함수(`dayIndex*2.2+rand`)에서 **환경 함수**로 교체: GDD로 진행하고 DLI 부족분만큼 지연. 1호점=관행점등+고장, 2호점=TOU점등+무고장, 3호점=게이트 측정용 무고장.
- **광량 판정 전환**: 최적화(`dliSchedule`)가 광주기를 심야로 옮기고 시간 압축 시 PPFD를 올리는데, 모니터링은 순간 조도 상한만 봤다 → 심야 점등·높은 순간조도가 오탐이 되고, 정작 LED 열화는 어떤 상한에도 안 걸림. 광량을 순간값 판정에서 빼고 **생육일 일적산(DLI) 달성률**로 판정. 생육일 경계는 자정이 아니라 **가장 어두운 시각** — 점등 블록이 어디로 옮겨가든 한 버킷에 담기게.
- **2단 밴드**: `iot-health.HEALTHY_RANGES`(온18~26·습55~75·CO₂800~1400)와 `crop-profiles.healthyRanges`(18~24·60~80·400~1200)가 서로 다른 기준을 쓰고 있었다. crop-profiles를 단일 출처로 두고 `faultRanges()`가 여유폭을 더해 고장 게이트를 파생. 최적대 이탈=주의(제어루프가 되돌림) / 게이트 이탈=심각(사람이 감). 가동률 게이트는 "설비가 살아 있었나"라 넓은 쪽을 쓴다.
- **GDD 수확 예측**: 적산온도로 현 사이클 진행률·수확 예정일·표준 사이클 대비 지연. 적산은 광 제약을 반영한 유효 GDD로 쌓는다(온도만 세면 광 부족한 날도 만근으로 잡혀 진행률이 실제 생장을 앞지름).
- **알림 배선**: `iot/generate`가 Z-score 이상일 때만 Notification을 만들고 있었다. 코드 주석이 "Z-score는 지속성 고장을 못 잡는다"고 직접 쓰면서 정작 알림 경로엔 게이트가 안 붙어 있던 것. 화면과 같은 `analyzeGrowthMonitoring`을 태워 **고장 게이트·CUSUM 드리프트·DLI 미달**까지 통지(6시간 쿨다운 중복 억제).

### CUSUM 드리프트 탐지 — 회귀 테스트가 드러낸 오탐 3건
회귀 테스트를 쓰자 "무고장 시드에서 전 센서 드리프트 탐지"가 나왔다. 원인이 셋 겹쳐 있었음:
- **lag 미전달**: `cusumDrift`의 기본 lag=24는 시간당 표본 전제인데(주석에 "30분당 48"이라 명시돼 있음) 모니터링이 30분 데이터에 그대로 호출 → 12시간 차분이 되어 일주기를 지우기는커녕 역위상으로 증폭.
- **차분 자체가 원인**: lag를 고쳐도 오탐. 차분은 저주파 흔들림을 lag 길이의 동일부호 런으로 바꾸는데(측정 acf(24)=−0.57) 그게 정확히 관리도가 잡도록 설계된 패턴. → 하루를 통째로 집계하면 일주기가 사라져 차분이 불필요. **일중앙값**에 차분 없이 관리도를 건다(평균은 단발 스파이크 한 개에 오염됨).
- **관리한계 고정**: H=5의 ARL₀가 465표본이라 2,880표본 창에선 오경보가 확정. Siegmund 근사로 길이 보정해도 부족(i.i.d. 전제가 안 맞아 실측이 이론보다 훨씬 느리게 떨어짐) → 관리이탈점(|z|>3)을 걸러낸 **관리상태 표본 부트스트랩**으로 한계를 잡음. 계열 전체를 재표집하면 드리프트 값이 귀무분포를 밀어올려 자기무력화되는 것도 확인·회피.
- **잘린 부분일**: 오경보가 전부 마지막 버킷에서 나왔다 — 반나절짜리 버킷의 중앙값은 온전한 하루와 비교 대상이 아님. DLI가 쓰던 `complete` 기준을 관리도에도 적용.
- **결과**: 무고장 오경보 60일 5%·30일 0%·7일 0%, 시나리오 냉방저하는 12일차로 정확히 특정(통계량 88.6 vs 한계 ~10). 회귀 테스트 16건 추가(`growth-monitoring.test.ts`) — 전체 50건 통과.

### 화면
- **웹**: 생장 섹션 신설(DLI 막대 + 목표선, GDD 진행률 + 생장곡선 + D-day), 센서 차트에 최적대 밴드 + 고장 게이트 점선 2단 표시, 광량 카드는 "DLI로 판정" 배지, 이벤트 타임라인에 DLI 미달 구간 추가, 각주 재작성.
- **앱**: DLI 막대·수확 예측 패널 추가, 드리프트 시점 세로선, X축을 인덱스 균등에서 **시간 비례**로(결측 구간 왜곡 제거), 30일 2,880점 다운샘플(이상치는 보존). 성장 모니터링 화면에 수확 D-day·진행률·DLI 스트립.
- 작물명 정합: 잔존 "새싹삼" 표기를 엽채류로 통일(`verification-spec.md` §5.2~5.4 재작성 포함).

---

## 2026-07-23 — 박태정

### 데모 라이브 e2e 통주행 리허설 — 숨은 통합버그 3건 수정
07-21에 "라이브 e2e(실 Gemini+온체인)는 별도 리허설 필요"로 남겨둔 걸 실제로 끝까지 돌림. dev 서버 → admin 로그인 Bearer → `demo/reset` → `demo/step` 1~8 실행(실 Gemini·온체인 live 모드). tsc로만 통과했던 오케스트레이션이 e2e에서 **3건의 통합버그**를 드러냄:
- **demo/step 대상 프로젝트 오식별**(`71efe5ec`): 스텝1~3 청약이 완납되면 3호점 status가 `funding→funded`로 바뀌는데(subscription.ts), 스텝4~8이 쓰는 `findFundingProject`가 `status="funding"`으로만 찾아 "No funding project found"로 중단. 시드상 1호점도 `funded`라 status 식별 자체가 불안정 → 안정적인 `tokenSymbol="MF03"`로 고정.
- **IoT 가동률 게이트 미배선**(`866def5c`): verify가 IoT 마일스톤(iotMinDays>0)을 `(data.uptimeRate>=90)`으로 판정하나 detect-anomaly가 `uptimeRate`를 반환한 적이 없어 **모든 프로젝트에서 IoT 마일스톤(m2·m4) 항상 실패**. `isHealthy`(도메인 정상범위)로 가동률 계산해 반환. 겸해서 시드가 IoT를 1·2호점에만 넣고 데모 대상 3호점엔 안 넣어 `dataCount=0`이던 것도 3호점 IoT 60일치 추가로 해소(가동률 99% 확인).
- **배당 분배 트랜잭션 타임아웃**(`0a262d79`): 보유자별 배당 쿼리 다수를 한 인터랙티브 트랜잭션에서 순차 실행 → pooler 지연으로 기본 5s 초과(관측 6.6s, P2028)해 콜드 콜에서 간헐 실패. `timeout 15s·maxWait 5s`로 확장.
- **결과**: reset 후 8스텝 전부 통과 — 청약 920구좌(9.2M) 완납 → escrow 4M→13.2M 충전 → 마일스톤 seq1~4 순차 집행(트랜치 4,620,000+3,960,000+2,640,000+1,980,000 = **13,200,000 전액, remaining 0**) → 배당 분배(investorDividend 1,013,565·perToken 1,101) → 3호점 status `operating`.
- 메모: **실 Gemini는 간헐적 추출 실패**가 있어 마일스톤 검증 스텝(4·6·8)이 1차 실패→재검증 통과하는 경우 발생(마일스톤 retryCount 게이트가 이걸 흡수). 발표 데모는 `DEMO_MODE=cached`로 성공 결과 재생이 안전. **온체인은 6월 배포분이 이미 release 소진 + Amoy RPC 불안정으로 txHash=null**(verify/release가 try/catch로 격리돼 DB 무중단 — 문서화된 앵커 동작).

---

## 2026-07-21 — 박태정

### 데모 오케스트레이션 복원 — demo/reset·demo/step (3호점 완결 흐름)
STO 재융합 후 미결이던 데모 자동 재생 흐름 복원. 지금까진 admin 콘솔로 단계별 수동 리허설만 됐음.
- **seedScenario 추출(`26a60ce7`)**: `prisma/seed.ts`의 시드 로직을 `src/lib/seed-scenario.ts`의 `seedScenario(prisma)` 공유 함수로 추출 → seed.ts(CLI)와 demo/reset(런타임)이 같은 로직 재사용(드리프트 방지). 청약 데모용 본인인증 투자자 이서연·박준혁 2명 추가(김투자 포함 3명).
- **데모 라우트 복원(`60c05224`)**: `demo/reset`(seedScenario 호출, DemoCache는 보존해 cached 재생 유지) + `demo/step`(8스텝). main STO 버전을 **내 2프로젝트 시드에 정합**해 재작성 — main은 `findProjectFirst()` 단일 프로젝트 가정이나, 내 시드는 청약대상(3호점 funding)과 마일스톤대상이 나뉨. **3호점이 funding+escrow+마일스톤4를 모두 보유**해 전 스텝을 3호점 하나로 완결: 청약 920구좌(300·200·420) 완납 → escrow 4M→13.2M 충전 → 마일스톤 seq1~4 순차 집행(잔여 정확히 0).
- **인증 정합(핵심)**: 7/21 코드리뷰에서 verify/complete/distribute에 `requireRole` 게이트를 건 탓에, 옛 demo/step의 **무인증 self-fetch가 401/403로 깨짐**. → demo/step이 시드 admin으로 `signSession` 토큰을 발급해 내부 fetch에 `Authorization: Bearer` 첨부(7/21 추가한 getServerSession Bearer 경로 재사용). subscribe는 fetch 없이 `executeSubscription` 직접 호출이라 무관. demo/reset·demo/step 자체도 `requireRole("admin")` 게이트(호출하는 프론트 페이지 없음 — 스크립트/콘솔 구동).
- **문서**: api-spec에 STO(subscribe·milestones verify/complete·dividends/distribute)·데모(reset·step) 섹션 + 데모 실행 런북(admin 로그인 토큰→Bearer) 추가, 시드 기준값을 융합 시드(투자자3·지점3·STO)로 갱신.
- **검증**: `tsc --noEmit` 0에러. **라이브 e2e(실 Gemini+온체인)는 별도 리허설 필요** — DB 변형·AI 비용·서버 구동이 걸려 이번엔 미실행. 단 demo/step이 wiring하는 verify/complete/distribute는 7/21 admin 콘솔 리허설에서 실 Gemini로 이미 통과 확인됨(이번 변경은 오케스트레이션 배선·프로젝트 타겟·시드 수량뿐).
- **병합 시점 미결(크로스트랙)**: 우민성이 `main`에 실제 `RoundGate.sol`을 배포·구현함이 확인됨 → 내 이전 결정 "RoundGate 컨트랙트 없음, 기획안 §8 표현 현실화"는 **뒤집힘**. §8 정합은 단독 결정 금지, 두 트랙(내 STO 재융합 ↔ 우민성 최적화/대시보드) 병합 시 RoundGate에 맞춰 조율. 그 외 병합 충돌 예상: `contracts/`(양쪽 수정+RoundGate 신규)·`seed.ts`/`schema.prisma`/`package.json`.
- **여전히 미결(외부 대기)**: OpenDID KYC(라온시큐어 Oracle 엔드포인트 = 외부 발급 서버URL+키 수령 후 — 코드베이스에 없음), 앱 프론트(외부 수령).

### STO 재융합 (feat/sto-operation-fusion) — 백엔드 복원 · 웹 UI · 앱 기반
피벗으로 제거했던 STO/블록체인을 운영 인프라와 **재융합**. 기준 문서 `sto-plan.md`(STO 에스크로 + AI검증 + 스마트팜 운영). 베이스 = `feat/pivot-operation-infra`, STO 원본은 `main`에 보존돼 있어 거기서 복원.

- **스키마·백엔드 복원**: STO 11모델 복원 + 운영 5모델 유지 통합. Project STO 금융필드 **nullable**(운영전용 지점 표현), Notification `milestoneId`·`projectId` 둘 다 optional. 온체인(Foundry 컨트랙트 + viem 서버 실행기)·STO 도메인 lib(subscription·waterfall·nav·ai-vision·ai-cache)·STO 코어 라우트 11개 복원. 인증은 기존 auth.ts(getServerSession·requireRole)가 SIWE 호환이라 무수정. 병합 스키마 **db push(세션pooler 5432, additive)** + 시드에 STO 통합(1호점 funded·2호점 운영·3호점 모집중).
- **코드리뷰 10건 반영**(워크플로우 high): 복원 라우트 4개(milestones complete/verify·dividends/distribute·admin/notify)가 **무인증**이던 것 requireRole 게이트, complete에 `release≤remaining` 가드, 실패알림 projectId, 시드 solvency, ai-cache 실패 미저장, subscribe 정수검증, verify baseUrl=request origin, bigint 직렬화 헬퍼 공용화(`lib/serialize.ts`).
- **작업 모델(2트랙 병렬)**: 앱 프론트는 **외부 수령 예정** → 앱은 인증기반까지만. **웹 UI는 기존 테마(globals.css 커스텀 클래스) 맞춰 직접 개발.** 앱 트랙 백엔드는 백그라운드 에이전트로 병행.
  - 앱: Expo RN 스캐폴딩(SDK57) + **JWT bearer**(login/signup token in body + getServerSession Authorization 헤더 → web/app 통합) + API클라이언트·로그인·세션(SecureStore) + 지갑연결 백엔드(POST /api/auth/wallet·/nonce, viem verifyMessage).
  - 웹 STO 5화면: `/projects`·`/projects/[id]`(펀딩·에스크로·마일스톤 타임라인)·마이페이지 포트폴리오·랜딩 STO 정합·`/admin/verify`(검증 콘솔). 전부 기존 CSS 클래스(.project-card·.progress·.timeline…) 재사용.
- **데모 리허설(실 AI·온체인)**: 투자자 청약 3호점 10구좌 → 200. admin 검증 콘솔 — 실 Gemini로 contract·receipt·photo·crossCheck **전부 통과** → 마일스톤 completed → 에스크로 트랜치 **6,125,000원(35%) 집행** 확인. **버그 수정**: verify-photo/receipt의 `milestoneType`은 `construction|trial_run|harvest|operation` 키여야 하는데 마일스톤 한글이름을 보내 실패하던 것 seq→type 매핑으로 수정.
- **RoundGate 결정 = 문서 현실화**: 기획안 §8은 RoundGate를 배포 컨트랙트로 서술하나 실제 Amoy 배포는 Escrow·Dividend·FarmToken 3종뿐(**RoundGate 없음**). 별도 컨트랙트 구현은 이번 범위 밖 → 순차 게이팅 의도는 Escrow 마일스톤 트랜치로 실현하고, 라운드 간 사이트 시퀀싱은 백엔드/운영 통제로 남긴다. **기획안 §8의 RoundGate 표현은 실배포와 불일치 → 기획안 수정 필요.**
- **미결(외부/후속)**: OpenDID KYC(라온시큐어 OmniOne, Oracle 엔드포인트 수령 후), 앱 프론트(외부 수령), demo/reset·demo/step 오케스트레이션 복원, 지갑 실서명 런타임 검증, contracts/ Foundry `forge build` 전 `git submodule update --init`.

---

## 2026-07-15 — 박태정

### 피벗 전 범위 멀티에이전트 코드리뷰 → 27건 수정
울트라코드 워크플로우(5차원 탐색 33에이전트 → 발견 건별 적대적 검증)로 피벗 변경분 리뷰. 28건 발견·27건 확정, 전부 수정(수정 자체는 순차 직접). 5커밋: `4e0004c7`(운영 API 견고화+**판매→재고 차감 연동** — sales 검증 404/400, trend·reports days 폴백, iot/generate 동시성·growthRate 캡, spaces 오버플로 클램프, 핫쿼리 인덱스 3개+db push), `f2ae4f09`(auth — signup P2002→409, me PATCH P2025→404, logout 쿠키옵션 중앙화, serializeBigInt 제거), `e830b494`(잔재 — constants/FilterBar/formatKRW·shortenHash/seed-dashboard-demo/.env.example 온체인·AI 키 삭제), `cdcaa013`(프론트 — operator 가짜폼→/operator/apply 실링크, 업로드 401 안내, main 중첩 해소, Section id prop·RoleCards 실링크), `d1779bb3`(docs — api-spec 실동작 정합·docs/README 표·README/CONTRIBUTING env 정정).
- **검증**: tsc 0에러 + dev 서버 curl — 판매 3봉 입력(201) → 재고 4→1 차감 → '오늘 할 일'에 "현재 1봉 보충" 실반영, 잘못된 입력 404/400, days=abc 폴백 200.
- 리뷰가 걸러낸 것 1건(기각): 의도된 결정(MVP 무인증)과 중복 지적.

### docs 정리 (push 전)
미추적이던 실질 문서 `service-plan.md`·`pivot-plan.md`를 레포에 추가(README·CLAUDE·CONTRIBUTING·docs/README가 참조). Phase 6에서 만든 리다이렉트 스텁 `plan.md`(18줄)·`verification-spec.md`(8줄)는 내용이 없어 제거하고 docs/README 표에서 삭제.

---

## 2026-07-14 — 박태정

### 피벗 Phase 3~6 — 스키마 정리 · 대시보드 · 핵심 3기능 · 문서
STO 제거(Phase 1~2) 이후 v18 운영 인프라 완성. 기준: `docs/service-plan.md`(내용은 v15와 앱 기능 동일, 사업레이어만 상이). 백엔드 중심 결정: 화면은 프론트 담당, "필요한 만큼만" API+시드.
- **Phase 3 스키마(`a2c5c8cd`)**: STO 11모델 제거(Escrow·Milestone·Transaction·TokenHolding·Dividend·DividendClaim·IdentityVerification·ProjectPartner·NavSnapshot·AiCache·DemoCache) + User/Project STO 필드·역관계 제거. auth/me·useAuth·MyPageClient·detect-anomaly·dashboard 소비처 정합. tsconfig가 prisma/ exclude라 시드는 tsc 대상 아님. prisma generate·tsc 통과.
- **Phase 4 대시보드(`32b9727b`)**: DashboardShell STO 패널(에스크로·NAV·마일스톤·거래·배당) 제거, IoT·이상·ESG + 온도추이 유지, 지점해결 projectId prop 전용. iot-health uptimeRate(마일스톤 게이트) 순화. next dev로 /dashboard 200 렌더 검증.
- **Phase 5 핵심3기능(`39cedb95`~`4dd8b2bf`)**: 신규 모델(Institution·Product·Inventory·HarvestRecord·SalesRecord) + **실 DB force-reset db push(사용자 동의, 세션 pooler 5432) + v18 시드**(지점2·품목3·재고·수확·판매·IoT5760). `GET /api/tasks/today`(오늘 할 일)·`POST /api/sales`+`GET /api/sales/trend`(판매-재배)·`GET /api/reports/institution`(기관 리포트)·이상알림(iot/generate→Notification·`GET /api/notifications`). 각 API 시드+curl로 데이터 e2e 검증. IoT 정상범위·생성기 새싹삼→수직농장 상추 문헌값 보정(온18-26·습55-75·CO2 800-1400·pH5.5-6.5), seed idempotent(deleteMany)화. Kaggle 노지 데이터는 도메인 불일치로 미채택.
- **Phase 6 문서·카피(`c9c75447`~`bcaa88ce`)**: 프론트 STO 카피·깨진 링크 정리(랜딩·홈·operator·admin — admin은 마일스톤 검증 UI→기관 성과 안내로 교체·MilestoneVerifyPanel 삭제), README·CLAUDE·CONTRIBUTING·api-spec v18 재작성, plan/verification-spec 대체 포인터, pivot-plan(DID/VC) 삭제. src STO 잔재 0.
- **검증 방식**: 로컬 `next build`는 EISDIR라 tsc + `next dev` + API curl(시드 데이터 e2e). 전 과정 순차 직접(에이전트·워크플로우 미사용).
- **미결**: MyPageClient `investor` 역할 라벨(레거시 enum, 무해) 잔존. DRB 지정과제 트랙 정합성(README에서 DRB 프레이밍 제거) — 팀 확인 필요. 화면 구현은 프론트 담당(백엔드는 API 계약+시드까지).

### 피벗 Phase 1 — STO·온체인 레이어 전면 제거
`docs/pivot-plan.md`(내용 v18 정합)의 STO 제거분. 문서상 Phase 1(lib·contracts 먼저)→2(라우트·컴포넌트 나중) 순서는 **route가 lib을 import**하는 구조라 lib만 먼저 지우면 tsc가 깨진다 → **소비처(라우트·페이지·컴포넌트) 먼저 제거해 lib을 고아화한 뒤 삭제**하도록 순서를 뒤집어 2커밋으로 진행.
- **커밋1 `26171207`** (STO 소비처 제거, 66파일 −5,666): API `auth/siwe`·`identity`·`subscribe`·`dividends`·`milestones`·`portfolio`·`projects`·`ai/verify-*`·`admin/notify`·`demo` 삭제(유지: `ai/detect-anomaly`·`auth/{login,signup,me,logout}`·`iot`·`spaces`·`operator-applications`·`upload`). 페이지 `market`·`transparency`·`projects`·`portfolio`·`demo`·`verify-identity` 삭제. 컴포넌트 `project`·`portfolio`·`transparency`·`demo`·`identity` + `home/{ProjectGrid,MarketProducts}` 삭제. 유지 정합: `FarmFi` 배럴 재수출·랜딩 `page.tsx` STO 섹션 제거.
- **커밋2 `8bfaaf4c`** (고아 정리, 36파일 −10,720): `contracts/` 전체(FarmToken·Escrow·Dividend + 테스트·배포·broadcast) 삭제. lib `onchain`·`contracts`·`wagmi-config`·`subscription`·`waterfall`·`demo-mode`·`ai-cache`·`ai-vision`·`nav-calculator`·`identity/`·`abi/` 삭제. npm `wagmi`·`viem`·`@rainbow-me/rainbowkit`·`siwe` 제거(`jose`·`bcryptjs` 유지). `dashboard/[projectId]` 라우트에서 `nav-calculator` 참조만 선제거(나머지 STO 집계 개조는 Phase 4).
- **검증**: 각 커밋 `npx tsc --noEmit` 0에러. DB 미변경.
- **의도적 잔여(런타임만 깨짐, tsc 무해 → 각 개조 phase 처리)**: `operator`·`AdminDashboard`·`DashboardShell`·`Stats`의 `/api/projects` fetch, 랜딩·`GreenBand`·`TokenHoldingsPanel`의 `/projects` 링크(Phase 6 카피), `MyPageClient`의 투자자 필드·`IdentityBadge`·`TokenHoldingsPanel`(Phase 3 스키마), `admin/MilestoneVerifyPanel`(admin 개조).

### 피벗 Phase 0 — 인증 SIWE(지갑) → 이메일+비밀번호 교체
v15 피벗(STO→공실전환 창업 지원 인프라)의 첫 코드 단계. `docs/pivot-plan.md` §6 Phase 0 수행.
- **세션 재사용**: `lib/auth.ts` jose JWT 레이어 유지, `SessionPayload.walletAddress`를 옵셔널(레거시)로 강등 — 세션 식별자는 userId+role. 유지 대상 라우트의 세션 발급 경로 보존.
- **신규 엔드포인트**: `api/auth/signup`(이메일 중복확인→bcryptjs 해시→세션 발급), `api/auth/login`(이메일 조회→bcrypt 비교→세션). `bcryptjs` 도입(네이티브 빌드 회피). `User.passwordHash` + `email @unique` 추가(나머지 STO 모델 정리는 Phase 3).
- **클라이언트**: `useAuth` login(email,password)/signup() 도입·wagmi/siwe 제거, `providers`에서 Wagmi/RainbowKit 제거하고 **QueryClientProvider 보존**, LoginForm/SignupForm 이메일·비번 폼, RoleSelect·auth/me에서 investor 자가배정 제거(가입 역할=운영자·공간제공자), Header 지갑버튼 제거, 고아가 된 WalletConnectPanel 삭제. 클라이언트 재생성으로 리셋 후 남아있던 피벗 클라이언트 desync 해소.
- **검증**(DB 미변경 — 라이브 로그인은 스키마 정리 후로): `tsc --noEmit` 0에러. `next dev`로 `/`·`/login`·`/signup` 200, `api/auth/me` 200, login·signup POST 라우트 405(GET 차단=컴파일 정상), 로그인 페이지 이메일·비번 폼 렌더 확인. src에 라이브 wagmi/rainbowkit 훅 0건(남은 "지갑 연결"은 Footer·투자자 페이지 정적 카피 → Phase 2/6).
- **환경 이슈(기존, 피벗 무관)**: `next build`(webpack production)가 경로 한글(`해커톤`)+Node 22/Next 14.2 `readlink` EISDIR로 실패 — 클린 HEAD에서도 동일 재현. dev·tsc는 정상. 후속 조치 필요(경로 이전 또는 Node/Next 조정).
- **후속(Phase 2 이후)**: siwe 라우트, 투자자 UI(MyPageClient 투자필드·IdentityBadge·TokenHoldingsPanel), "지갑 연결" 카피 제거. JWT_SECRET 필수(.env.example 문서화, .env는 로컬만).

---

## 2026-07-04 — 박태정

### 병합 코드 리뷰 → 결함 수정 2건 커밋
7/2 병합분(온보딩·본인인증·포트폴리오·프로젝트생성 등 7커밋) 전체 리뷰 후 결함만 수정:
- **신원인증** (`b98dad7`): `identity/status`가 txId 소유자 확인 없이 현재 세션 유저를 인증 완료 처리하던 구멍 수정(소유자 불일치 시 미반영, userId 미연결 세션은 귀속). `IDENTITY_PROVIDER` 오타 `opmenid`→`opendid`, StubVerifier의 미사용 `simulate` 파라미터 제거.
- **청약 인증·한도 집행** (`c54ae8c`): `/api/subscribe`가 클라이언트 body의 userId를 신뢰하던 것을 **세션(JWT) 전용**으로 전환 + `identityVerified` 미완료 403 + **연간 투자한도 집행**(올해 청약 누적 기준 — investor-limit 룰엔진 산출값이 처음으로 실제 작동). 핵심 로직은 `src/lib/subscription.ts`로 추출, `demo/step`은 self-fetch 대신 lib 직접 호출(신뢰 경로, `NEXT_PUBLIC_BASE_URL` 의존 1곳 제거). 시드·리셋 투자자 3명 인증완료 상태로 시딩. **demo/reset FK 위반 수정**: OperatorApplication/IdentityVerification/Space를 안 지우고 `user.deleteMany()` 하면 500 나던 것.
- 리뷰에서 확인만 하고 보류한 것: admin·milestones·dividends·demo 라우트 무인증(plan L2-11-1 잔여 — MVP 우선순위 낮음), 프로젝트 생성 시 온체인 컨트랙트 미연결(다중 프로젝트는 DB 전용).

### Escrow 회계 불변식 테스트 추가 (`9697c38`)
`forge` fuzz/invariant로 128k회 무작위 액션 조합 검증 → **solvency**(잔고 ≥ remaining, 강제 ETH 유입에도 유지) + **자금 보존**(들어온 총액 == 운영자 지급 + 투자자 환불 + 잔여, 환불 경로 포함 무손실) 통과. 비례환불 회계에 드리프트·dust 없음 확인. `forge test` 19/19.

---

## 2026-06-26 — 박태정

### 온체인 Amoy 배포 완료 — txHash 실증명 (트랙 B 완수)
faucet POL 0.3 확보 후 실배포·온체인 e2e 재검증까지 끝. **`txHash`가 더 이상 `null`이 아니라 amoy.polygonscan에 실제로 뜬다.**
- **배포** (`forge script Deploy.s.sol --broadcast`, 가스 ~0.235 POL): FarmToken `0xc1aB764bE7C8F36980e94016bc52ED486Dbba53b` / Escrow `0xA855f6398fb71AD197Ec055853007007D3F7d452` / Dividend `0x6f0b29d66E8ED80721041C442c6f3e42a0a3dE7f`. 서버지갑(=배포자=operator=VERIFIER) `0x535FD6…caF9`. MINTER→Escrow, VERIFIER→배포자 권한 부여까지 스크립트가 처리.
- **주소 기록**: `frontend/.env`에 `ESCROW_ADDRESS`/`FARM_TOKEN_ADDRESS`/`DIVIDEND_ADDRESS` 추가 → `onchain.ts`의 `isOnchainEnabled()`가 true로 전환.
- **부트스트랩 청약 1회**: 서버지갑이 `subscribe()` 0.01 POL(=10토큰) 청약 → Escrow에 자금 락(totalLocked/remaining 0.01, currentMilestone 1). 사업수치(1,750구좌)는 DB 데모가 유지, 온체인은 증명 앵커.
- **온체인 e2e 재검증**: `onchain.ts`의 `verifyMilestoneOnChain`/`releaseTrancheOnChain`를 M1~M4로 실호출 → 8건 전부 txHash 반환. 최종 currentMilestone=5, totalReleased=0.01(전액), remaining=0. release가 operator(서버지갑)로 청약금 회수 → **순비용 가스뿐**(잔고 0.065 POL).
- 메모: 검증은 onchain 함수 직접 호출 격리 스크립트(`_onchain-test.ts`, 검증 후 삭제)로 수행 — AI 검증 로직은 06-21 e2e에서 이미 통과 확인됨이라 viem 호출 경로만 격리 증명. release는 **배포당 1회성**(재실행 시 `Already released` revert) — 반복 시연은 재배포 또는 `DEMO_MODE=cached` 재생.

---

## 2026-06-21 — 박태정

### 데모 8단계 e2e 실제 실행 — 검증 차단 버그 2건 잡고 전체 통과
dev 서버 띄우고 `/api/demo/reset` → `step 1~8` 실제 실행(Gemini 실호출). 그동안 AI 추출만 단독 검증했는데, e2e로 처음 끝까지 돌려 **2건의 신호 정합 버그** 발견·수정:
- **사진 객체 정규화** (`verify-photo`): Gemini가 객체를 `{label, box_2d}` 배열로 반환 → 코드가 `string[]` 가정으로 `join()`해 `"[object Object]"`가 됨. **마일스톤1 crossCheck(영수증↔사진)가 항상 실패**. label 문자열로 정규화해 해결.
- **영수증 신호 분리** (`verify-receipt`): 마일스톤4 `conditionText`가 "IoT 60일 + 복수 판매 영수증"을 묶어 전달 → 영수증 검증기가 IoT 가동률까지 떠안아 `matchesCondition=false`. 프롬프트에 "영수증으로 확인 불가한 IoT·센서·사진 요건은 별도 신호로 검증되니 판단 제외" 명시. 영수증은 자기 조건(복수 판매)만 평가.
- **결과**: 8단계 전부 통과 — 청약 1,750구좌 완판, 트랜치 17,500,000 **전액 해제**(remaining 0), 마일스톤 1~4 completed, 배당 분배, status `operating`. 정산 워터폴도 정합(투자자배당 1,013,565 / perToken 579).
- 메모: AiCache는 `milestoneId`별 키라 reset(새 마일스톤 id)하면 자동 무효화. 단일 스텝 재검증 시엔 해당 캐시 행 삭제 필요.

### 온체인 트랜치 집행 연동 (배포 전 코드 준비 완료)
검증명제 ②③을 온체인에서 집행하도록 연동. **POL 없이 가능한 코드까지 완료, 실배포만 남음.**
- **`onchain.ts` 신규**: viem로 서버 지갑(=배포자=VERIFIER)이 `Escrow.verifyMilestone`(②)·`releaseTranche`(③) 호출. `isOnchainEnabled()` — `ESCROW_ADDRESS`/`PRIVATE_KEY` 미설정 시 비활성→`null` 반환(배포 전 안전).
- **라우트 연동**: `verify`는 AI 통과 시에만 `verifyMilestoneOnChain` 호출(강제통과 금지 유지), `complete`는 해제 시 `releaseTrancheOnChain` 호출 → 지금까지 `null`이던 txHash 채움. 체인 오류는 try/catch 격리 → DB 데모 무중단.
- **점검 통과**: tsc 0 에러, `forge build` 성공. 흐름 정합 확인 — 데모 마일스톤 seq 1→4 순서가 컨트랙트 `seq==currentMilestone`과 일치, operator=배포자라 release POL이 서버 지갑으로 회수(순비용 가스뿐).
- **방식 = 증명 앵커링**: DB 데모는 사업수치(1,750구좌) 유지, 온체인엔 서버 지갑 소액 청약 1회로 부트스트랩 후 verify/release를 실제 호출해 txHash 증명. (완전 온체인 청약은 faucet POL 한도 초과라 제외)
- **⚠️ 시연 운영 노트**:
  - 온체인 release는 **배포당 1회성**(재실행 시 `Already released` revert→txHash null). 반복 시연은 ①배포 직후 라이브 1회 실행→txHash가 `DemoCache`에 캐시되면 `DEMO_MODE=cached`로 재생, 또는 ②재배포.
  - 배당(step 7)은 오프체인 유지(명제 ①②③은 트랜치로 충족, 범위 밖).
  - 라이브 1회 실행 시 온체인 txn ~8개 → 약 20~40초 추가 지연.

---

## 2026-06-20 — 박태정

### AI 검증 무료화 — Gemini provider + mock 이미지 (verify 실테스트 통과)
- **provider 추상화** (`src/lib/ai-vision.ts` 신규): `extractFromImage()` 공용 헬퍼 — 키가 설정된 provider만 **Gemini → OpenAI → Anthropic** 순서로 폴백. verify-receipt/contract/photo 라우트의 중복 callOpenAI/callAnthropic 제거 → 헬퍼 호출로 교체(검증 로직 불변).
- **무료 Gemini** (`@google/genai`, 모델 `gemini-3.5-flash`): 현재 `GEMINI_API_KEY`만 설정 → 무료로 동작. 유료 전환은 `OPENAI/ANTHROPIC_API_KEY`만 채우면 라우트 수정 없이 폴백 체인에 자동 합류.
- **mock 이미지 5장** (`public/demo/`): ChatGPT 콜라주 1장을 sharp로 5분할(mock-contract / mock-receipt-1·2 / mock-photo-1·3). 원본 콜라주는 삭제.
- **verify 실테스트 통과**(Gemini 단독): 계약서 금정구·83㎡ 정상 추출(프로젝트 정합), 구매영수증 LED/센서/재배대/관수 키워드 확보(교차검증용), 사진 설비·작물 confidence 0.95+. → **무료 모델로 데모 검증 충분.** (※ e2e crossCheck/조건 정합 버그는 06-21에 수정)
- 잔여 메모: `NEXT_PUBLIC_BASE_URL` 미설정 시 verify self-fetch는 localhost:3000 기본값 사용. `schema.prisma` ProjectPartner.role 주석 `equipment_partner` 잔존(모델 유지, 시드 미사용).

---

## 2026-06-19 — 박태정

### 사업계획서 기준 정합 (plan + 코드 + 문서)
대조 결과 `코드 == plan.md`인데 둘 다 사업계획서와 달라, **사업계획서를 기준으로 전부 정합**:
- **정산 워터폴** (`0153a7b`): OPEX 100만(전기60+재료40), 건물주 **월 고정 임대료 50만**(매출 무관), 플랫폼 수수료 **1.5%**(표13), **설비파트너 DRB 정산 제거**(설비공급·자문 협력사로만), 운영자 기본급 제거. 출력 키 `{opex, landlordRent, platformFee, investorDividend, operatorResidual, breakdown}`.
- **시드 단위경제** (`ecf3543`): CAPEX=모집목표 **1,750만**, 토큰가 **1만원**/총 **1,750**, 면적 25평(83㎡), 마일스톤 612.5/525/350/262.5만, M1 자산가치 1,050만, 작물 **새싹삼**, 데모 청약 500/250/1000·매출 297만.
- **검증 신호 표3** (`47231ee`): M2 `[iot]`, M3 `[photo,receipt]`, M4 `[iot,receipt]` + mock 매핑(M2 무이미지, receipt-2=판매 영수증).
- **문서** (`ca33655`·`72659cb`): api-spec 갱신; 중복·낡은 `dev-report.md` 삭제(참조 4곳 정리).

### DB 온라인화 (Supabase) — 실제로 붙고 시드됨
- 6/11 `tenant/user not found`의 원인 = **무료 플랜 자동 일시정지**(IPv4/IPv6 아님 — 이미 IPv4 pooler). 대시보드 Restore로 복구.
- **마이그레이션 gotcha**: 트랜잭션 pooler(6543)는 `prisma db push/pull`이 멈춤 → **세션 pooler(같은 호스트 5432, pgbouncer 제거)** 로 push. 런타임/시드 INSERT는 6543 정상.
- 시드 완료 + 정합값 DB 반영 확인. **API 스모크 통과**(`/api/projects`·`/api/dashboard` 200). 시드 .env 미로딩 버그 수정(`57a05d1`, dotenv import).
- 관찰: 시드 직후 라이브 NAV=0/-100%(청약·완료 0건) → 데모 돌리면 해소.

---

## 2026-06-11 — 박태정 · 버그 일괄 수정

- **컨트랙트** (`forge test` 17/17): Escrow refund에 projectFailed 게이트·회계 차감·첫 해제 후 청약 차단; Deploy.s.sol 배포자 PRIVATE_KEY 유도(DEFAULT_SENDER 오배정 방지).
- **P0(데모 차단)**: complete의 `userId:"system"` FK 위반 → userId optional; verify의 iot `data.passed` 오참조(M3 항상 실패) 수정; demo/step 실제 base64 로드 + 강제 verified 제거(**mock+키 전까진 스텝4~8 실패가 정상**); demo/reset IoT·NAV 재시드(`iot-seed.ts`); detect-anomaly 가동률 기간 기준·0건 통과 차단.
- **P1(검증 고도화)**: verify-contract 주소·면적(±20%) 대조; verify-receipt conditionText 부합; crossCheck(영수증↔사진) + 실패 Notification; ai-cache 전용 AiCache 모델로 분리.

---

## 2026-06-07 — 박태정 · 초기 셋업·문서체계

- **Prisma 7** driver adapter(`@prisma/adapter-pg`)로 정착 — 스키마 url 제거 + `prisma.config.ts`, `new PrismaClient()` 무인자 ❌. tsc 0 에러.
- `api-spec.md` 작성(API 15개), 문서체계 수립(레퍼런스=제자리 갱신 / 기록=이 로그 append), `.env` gitignore.
- 결정: **도커 미사용**(Vercel+Supabase) 확정.
- 초기 버그수정: verify `imageBase64` 키, detect-anomaly 모델·필드명, demo/step milestoneType enum, Prisma import 경로.
