# 웹 화면 61개 · 라우트 매핑

Figma 화면 ID를 Next.js 라우트와 짝지은 표. 화면을 만들 때 이 표의 라우트를 쓴다.
덤프 원본은 `design/screens/farmfi-web/<페이지>/<ID>.txt`이고, 페이지는 `_핵심_UI` · `관리자_콘솔` · `비핵심_UI_관리자_콘솔_제외_` 셋이다.

이 표는 디자인 최종본 `.fig` 기준이다.

## 공통·인증 (C)

| ID | 화면 | 라우트 | 티어 |
|---|---|---|---|
| C-01 | 서비스 홈 | `/` | P0 |
| C-02 | 로그인 | `/login` | P0 |
| C-03 | 회원가입 | `/signup` | P0 |
| C-04 | 이용 목적 선택 | `/start` | P0 |
| C-I01 | 본인확인 방법 선택 | `/verify` | P0 |
| C-I02 | 모바일 신분증 확인 | `/verify/mobile-id` | P0 |
| C-I02E | 모바일 신분증 확인 실패 | `/verify/mobile-id` (실패 분기) | 예외 |
| C-I03 | 본인 명의 계좌 확인 | `/verify/account` | P0 |
| C-I05 | 본인확인 완료 | `/verify/done` | P0 |

## 투자자 (I)

| ID | 화면 | 라우트 | 티어 |
|---|---|---|---|
| I-01 | 프로젝트 상세 | `/projects/[id]` | P0 |
| I-02 | 투자 적합성 확인 | `/projects/[id]/invest/eligibility` | P0 |
| I-02E | 부적격·한도 초과 안내 | `/projects/[id]/invest/eligibility` (모달) | 예외 |
| I-03 | 최종 확인·전자서명·납입 | `/projects/[id]/invest/confirm` | P0 |
| I-03E | 납입 실패·재시도 | `/projects/[id]/invest/confirm` (실패 분기) | P0 |
| I-04 | 투자 신청 완료 | `/projects/[id]/invest/done` | P0 |
| I-05 | 투자 신청·취소 내역 | `/investor/applications` | Phase 2 |
| I-06 | 투자자 홈 | `/investor` | P0 |
| I-07 | 보유 투자·연결 계좌 | `/investor/holdings` | P0 |
| I-08 | 투자금 회수 상세 | `/investor/payouts/[id]` | P0 |
| I-09 | 투자자 알림함 | `/investor/notifications` | Phase 2 |
| I-10 | 투자자 알림 설정 | `/investor/notifications/settings` | Phase 2 |

## 구매자 (B)

| ID | 화면 | 라우트 | 티어 |
|---|---|---|---|
| B-01 | 픽업 지점 선택 | `/subscribe` | P0 |
| B-02 | 팩 크기·수령 주기 | `/subscribe/plan` | P0 |
| B-03 | 지점 재고 기반 구성 | `/subscribe/compose` | P0 |
| B-04 | 주문서 확인 | `/subscribe/order` | P0 |
| B-04M | 쿠폰 선택 모달 | `/subscribe/order` (모달) | 예외 |
| B-05 | 결제수단·자동결제 | `/subscribe/payment` | P0 |
| B-06 | 정기구독 신청 완료 | `/subscribe/done` | P0 |
| B-07 | 내 구독 이용 현황 | `/subscriptions` | P0 |
| B-08 | 구성·일정 변경 | `/subscriptions/change` | Phase 2 |
| B-09 | 픽업 바코드 확인증 | `/subscriptions/pickup/[id]` | P0 |
| B-00E | 구독 없음 빈 상태 | `/subscriptions` (빈 상태) | 예외 |

## 운영자 (O)

| ID | 화면 | 라우트 | 티어 |
|---|---|---|---|
| O-01 | 운영 공간 탐색 | `/operator/spaces` | P0 |
| O-02 | 공간 상세·신청 시작 | `/operator/spaces/[id]` | P0 |
| O-03 | 자격·서류 신청 | `/operator/apply` | P0 |
| O-04 | 현장 방문 예약 | `/operator/apply/visit` | P0 |
| O-05 | 필수 교육 | `/operator/apply/education` | P0 |
| O-06 | 공간 최종 확정 | `/operator/apply/confirm` | P0 |
| O-07 | 계약 확인·전자서명 | `/operator/apply/contract` | P0 |
| O-08 | 보증서 발급·앱 설치 | `/operator/certificate` | P0 |
| O-09 | 개점 준비 현황 | `/operator` | P0 |
| O-10 | 마일스톤 검증 현황 | `/operator/milestones` | Phase 2 |
| O-11 | 증빙 제출 | `/operator/milestones/[id]/evidence` | P0 승격 |
| O-11E | 증빙 보완·이의제기 | `/operator/milestones/[id]/appeal` | Phase 2 |
| O-12 | 마일스톤 집행 완료 | `/operator/milestones/[id]/done` | Phase 2 |
| O-13 | 정산·지급 내역 | `/operator/settlements` | Phase 2 |

## 관리자 (A)

| ID | 화면 | 라우트 | 티어 |
|---|---|---|---|
| A-01 | 콘솔 홈 | `/admin` | P0 |
| A-02 | 운영자 심사·가배정 | `/admin/operators` | P0 |
| A-03 | 보증서 발급 관리 | `/admin/certificates` | P0 |
| A-04 | 공간·설비 구성 | `/admin/spaces` | P0 |
| A-05 | 구독·픽업 예외 관리 | `/admin/subscriptions` | Phase 2 · 도면 없음 |
| A-06 | 투자 프로젝트 관리 | `/admin/projects` | P0 |
| A-07 | 마일스톤 설정 | `/admin/projects/[id]/milestones` | P0 |
| A-08 | 증빙 재검토 | `/admin/evidence` | P0 승격 |
| A-09 | 외부 전문가 최종 판정 | `/admin/expert-review` | Phase 2 |
| A-10 | 정산 규칙 | `/admin/settlement-rules` | Phase 2 |
| A-11 | 정산 결과 | `/admin/settlements` | Phase 2 |
| A-12 | 감사 로그 | `/admin/audit-logs` | Phase 2 |
| A-13 | 권한 관리 | `/admin/roles` | Phase 2 |
| A-14 | 알림 발송 | `/admin/notifications` | Phase 2 |
| A-15 | AML·이상거래 | `/admin/aml` | Phase 2 |
| A-16 | 매출·비용 입력 | `/admin/ledger` | Phase 2 |

## 도면 없는 화면

`A-05 구독·픽업 예외 관리`는 `.fig`에 도면이 없고 관리자 콘솔 사이드바 15항목에도 들어있지 않다.
라우트·API·화면은 살려 두되 콘솔 내비에서는 노출하지 않는다. 직접 URL로 들어가면 열린다.

## 만들지 않는 화면

`/wallet`, `/wallet/reconnect`로 들어오면 `/verify/account`로 리다이렉트한다(H2).
`MVP 필수 배지`는 화면이 아니라 Figma 범례다.

## 역할별 내비게이션

최종본은 화면마다 역할 내비를 고정으로 붙인다. 화면을 만들 때 아래 셸을 쓴다.

| 셸 | 대상 | 링크 |
|---|---|---|
| 공용 | C-01~C-I05 | 홈 · 정기구독하기 · 투자자 시작하기 · 운영자 시작하기 / 회원가입 · 로그인 |
| 투자자 포털 | I-01~I-10 | 프로젝트 · 내 투자 · 알림 |
| 운영자 포털 | O-01~O-13 | 공간 찾기 · 내 준비 현황 · 보증서 |
| 구매자 | B-01~B-09 | 정기구독 · 내 구독 |
| 관리자 콘솔 | A-01~A-16 | 좌측 사이드바 15항목 + 로그아웃 |
