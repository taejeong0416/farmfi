# 융합 실행계획 (STO + 운영 인프라)

기준 문서: `FarmFi_STO_기획안_v18.md` (STO 에스크로 + AI 검증 + 스마트팜 운영 융합).
브랜치: `feat/sto-operation-fusion` (베이스 = `feat/pivot-operation-infra`).

## 확정 아키텍처

- **투자자·운영자**: Expo / React Native 앱 (Android 우선) — `app/`
- **관리자·기관**: 기존 Next.js 웹 유지 — `frontend/`
- **백엔드 API**: Next.js API Routes + Prisma 7 + Supabase (공용)
- **온체인**: Polygon Amoy(체인 80002) 기존 배포 재사용. 앱=wagmi/viem/Reown AppKit, 서버=viem.
  - FarmToken `0xc1ab764be7c8f36980e94016bc52ed486dbba53b`
  - Escrow `0xa855f6398fb71ad197ec055853007007d3f7d452`
  - Dividend `0x6f0b29d66e8ed80721041c442c6f3e42a0a3de7f`
- **컨트랙트**: Foundry (Escrow·Dividend·FarmToken)
- **AI 검증**: 서버사이드 SDK 3종 (OCR·비전·IoT 이상탐지)
- **신원(KYC)**: 라온시큐어 OpenDID 모바일 신분증
- **배포**: 앱=EAS Build(Android), 웹/API=Vercel, DB=Supabase

## Phase 1 — 백엔드 STO 레이어 복원

`main`에 보존된 STO 코드를 복원하고 현재 스키마·인증에 정합.

**1.1 컨트랙트·온체인 기반 복원**
- 1.1.1 `git checkout main -- contracts/` — Foundry 프로젝트(Escrow·Dividend·FarmToken + 테스트) 복원
- 1.1.2 Amoy 기존 배포 주소를 env/상수로 연결 (재배포 없음)
- 1.1.3 `frontend/src/lib/{onchain,contracts}.ts` 복원 + `viem` 재설치 (서버사이드는 viem만)
- 1.1.4 검증: `tsc --noEmit` 통과 → 커밋

**1.2 STO API 라우트 복원 + 인증 정합**
- 1.2.1 `main`의 STO 라우트(projects·청약·에스크로·배당·AI검증) 복원 목록화
- 1.2.2 현재 스키마 정합 — Project nullable 금융필드·Notification optional FK, SIWE 의존 코드는 이메일 세션으로 교체
- 1.2.3 지갑연결 API `POST /api/auth/wallet` (nonce→서명검증→User.walletAddress 부착, 로그인 대체 아님)
- 1.2.4 검증: `tsc` + `next dev`로 curl 200/401 확인 → 커밋

**1.3 시드·DB 통합**
- 1.3.1 seed.ts에 STO 데이터(펀딩 프로젝트·마일스톤 4단계·모의 투자자) 추가, 운영 시드 유지, idempotent 유지
- 1.3.2 `prisma db push` (세션 pooler 5432 `--url`) → 시드 실행(6543)
- 1.3.3 검증: STO·운영 API 둘 다 실데이터 응답 → 커밋

## Phase 2 — Expo RN 앱 스캐폴딩 (투자자·운영자)

**2.1 모노레포에 `app/` 생성**
- 2.1.1 `npx create-expo-app app` (TypeScript, Expo Router)
- 2.1.2 검증: Android 에뮬레이터/Expo Go 기본 구동

**2.2 인증·API 클라이언트**
- 2.2.1 백엔드에 RN용 JWT bearer 발급 경로 추가 (jose 재사용, 쿠키 병행)
- 2.2.2 공용 API 클라이언트 + 로그인/회원가입 화면
- 2.2.3 검증: 앱 로그인 → `/api/auth/me` 표시

**2.3 핵심 화면 (역할별)**
- 2.3.1 투자자: 프로젝트 목록/상세(펀딩 진행률·마일스톤 타임라인)
- 2.3.2 운영자: 오늘 할 일·판매입력·생육 대시보드·이상알림
- 2.3.3 검증: 시드 데이터 앱 표시, 판매입력→재고 차감 왕복

## Phase 3 — 앱 온체인·청약 흐름

**3.1 지갑 연결 (Reown AppKit)**
- 3.1.1 Reown 프로젝트ID + `@reown/appkit-wagmi-react-native` 설정 (Amoy)
- 3.1.2 지갑연결→서명→`POST /api/auth/wallet` 부착
- 3.1.3 검증: 지갑주소 마이페이지 표시

**3.2 청약→에스크로→배당 데모 흐름**
- 3.2.1 청약 화면(금액→한도체크→모의결제→TokenHolding 반영)
- 3.2.2 마일스톤 검증(관리자 웹)→트랜치 집행 tx 해시 앱 타임라인 표시
- 3.2.3 배당 스냅샷 조회·수령(claim)
- 3.2.4 검증: 기획안 §8 데모 흐름 앱+웹 통주행 1회

## Phase 4 — KYC (라온시큐어 OpenDID)

스키마는 실연동/모의 무관하게 동일하므로 뒷단계 비블로킹.

**4.1 접근성 확정**
- 4.1.1 OpenDID 오픈소스·샌드박스 접근성 조사 → 실연동 vs 모의 Verifier 결정
- 4.1.2 산출: 결정 + 근거 dev-log 기록

**4.2 Verifier 흐름 구현**
- 4.2.1 IdentityVerification API 복원(request-offer-qr→submit→confirm-verify), 결정에 따라 실SDK/모의
- 4.2.2 검증 성공 시 User.identityVerified·investorAnnualLimit 산출 + 청약 게이트 연결
- 4.2.3 앱 KYC 화면: QR/딥링크→상태 폴링→인증 뱃지
- 4.2.4 검증: 미인증 청약 차단 → KYC 통과 → 청약 허용 왕복

## Phase 5 — 정합·데모 마감

**5.1 미결 결정**
- 5.1.1 RoundGate: Escrow 내 순차 게이트 구현 or 기획안 §8 표현 현실화 — 택1
- 5.1.2 관리자 웹 STO UI 필요분 정리(마일스톤 검증 패널 등)

**5.2 문서·리허설**
- 5.2.1 api-spec 융합 API 재작성, dev-log append
- 5.2.2 데모 시나리오 문서화 + 전체 리허설 1회

## 의존성

- P1 → P2 → P3 직렬.
- P4.1(조사)·5.1.1(RoundGate 결정)은 언제든 병행 가능, 뒤 단계 비블로킹.
