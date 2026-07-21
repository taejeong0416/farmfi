# OpenDID Verifier 연동 가이드 (오라클 배포 + 서비스 연결)

> 2026-07-21 SSH로 실측 확인. 오라클에 OmniOne OpenDID 2.0.0 풀스택이 떠 있고,
> Verifier(8092)를 외부에 개방해 우리 서비스가 실연동할 수 있는 상태로 만들었다.

---

## 1. 한 줄 요약

오라클 서버(`168.138.36.235`)에 **OmniOne OpenDID 2.0.0 전체 스택**이 `did-orchestrator-server`로 가동 중이다. 신원인증에 쓸 **Verifier는 8092 포트**, 외부 개방 완료(방화벽+클라우드 보안리스트). 우리 Next.js는 `http://168.138.36.235:8092/verifier/api/v1/...`로 붙는다. 남은 건 **Verifier Admin에 검증정책(VP Policy) 1개 등록** + 레포의 `OmniOneVerifier` 구현.

---

## 2. 배포 현황 (2026-07-21 실측)

- **서버**: Oracle Cloud ARM, `168.138.36.235` (리전 ap-osaka-1), 유저 `opc`, OS Oracle Linux 9.7
- **접속**: `ssh -i ~/.ssh/oracle-farmfi.key opc@168.138.36.235`
- **구성**: `~/did-orchestrator-server/source/did-orchestrator-server/` 에서 orchestrator가 8개 엔티티 jar를 기동. Postgres는 도커 컨테이너 `postgre-opendid`(호스트 5430).

### 포트 맵 (전부 가동 확인 `status: UP`)

| 포트 | 서비스 | jar | 외부개방 |
|---|---|---|---|
| **8092** | **Verifier** ← 신원인증 연동 대상 | `did-verifier-server-2.0.0.jar` | ✅ 개방 |
| 8090 | TA (Trust Agent) | `did-ta-server` | ✗ |
| 8091 | Issuer (VC 발급) | `did-issuer-server` | ✗ |
| 8093 | API server | `did-api-server` | ✗ |
| 8094 | CA (인증앱) | `did-ca-server` | ✗ |
| 8095 | Wallet | `did-wallet-server` | ✗ |
| 8099 | Demo | `did-demo-server` | ✗ |
| 9001 | Orchestrator (기동/관리 대시보드) | `did-orchestrator-server` | ✗ (SSH 터널로만) |
| 5430 | Postgres | 도커 `postgre-opendid` | ✗ |

> **체인**: 별도로 운영측 호스팅 체인(`stage-chain.omnione.net`, chainId 201210)이 있고 이건 이미 공개. 오라클의 OpenDID 스택은 개발 샌드박스.

---

## 3. Verifier 연결 정보 (핵심)

- **Base URL**: `http://168.138.36.235:8092`
- **API prefix**: `/verifier/api/v1/`
- **관리 콘솔(웹)**: `http://168.138.36.235:8092/` — React SPA "OpenDID Verifier Admin"

### 프로토콜 엔드포인트

| 메서드·경로 | 역할 |
|---|---|
| `POST /verifier/api/v1/request-offer-qr` | 인증 세션·QR 발급 (지갑앱이 스캔) |
| `POST /verifier/api/v1/request-verify` | 지갑의 VP 제출 접수 |
| `POST /verifier/api/v1/confirm-verify` | 검증 확정·클레임 반환 |
| `POST /verifier/api/v1/request-profile` | 검증 프로필 조회 |

### `request-offer-qr` 요청 계약 (실측)

```http
POST /verifier/api/v1/request-offer-qr
Content-Type: application/json

{ "policyId": "<Verifier Admin에 등록된 VP 정책 ID>" }
```

- 빈 바디 → `{"code":"9999","description":"policy id cannot be null"}`
- `{"policyId":"x"}` (없는 ID) → `{"code":"SSRVVRF00201","description":"VP_POLICY is not found."}`
- ⇒ **필드명은 `policyId`가 맞고, 유효한 정책 ID만 있으면 동작한다.**

---

## 4. 우리 서비스(이 레포)에서 연결하는 법

### 4-1. 코드 위치

- 추상화: `frontend/src/lib/identity/verifier.ts`
  - 현재 기본은 `StubVerifier`(3초 자동인증 목업).
  - 실연동 클래스 `OmniOneVerifier`는 **아직 껍데기**(호출 시 `not implemented`).
  - 팩토리 `getVerifier()`가 `IDENTITY_PROVIDER === "opendid"`일 때만 `OmniOneVerifier` 사용.
- API 라우트: `frontend/src/app/api/identity/offer/route.ts`, `.../status/route.ts` (내용 변경 불필요 — 추상화 뒤만 바꾸면 됨).

### 4-2. 환경변수 (`frontend/.env`)

```env
IDENTITY_PROVIDER=opendid
IDENTITY_VERIFIER_URL=http://168.138.36.235:8092
IDENTITY_VERIFIER_POLICY_ID=<Admin에서 등록한 정책 ID>
```

> `.env`는 gitignore됨. 배포처(Vercel)에도 같은 3개를 환경변수로 넣어야 서버사이드 호출이 된다.

### 4-3. `OmniOneVerifier` 구현 골자

```ts
async createOffer(policy) {
  const res = await fetch(`${this.baseUrl}/verifier/api/v1/request-offer-qr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ policyId: process.env.IDENTITY_VERIFIER_POLICY_ID }),
  });
  const data = await res.json();      // offer payload + txId
  return { txId: data.txId, qrData: JSON.stringify(data), deeplink: /* 지갑 스킴 */ };
}
// getStatus/getClaims → request-verify / confirm-verify 응답 스키마에 맞춰 매핑
```

### 4-4. 남은 선행 작업 (이게 없으면 offer가 실패)

**Verifier Admin에 VP 검증정책을 등록해야 유효한 `policyId`가 생긴다.**
1. 브라우저로 `http://168.138.36.235:8092/` 접속 (관리 콘솔)
2. 로그인 후 Policy / Proof Request 프로필 생성 (요청 클레임: 실명·생년월일·성인여부)
3. 생성된 정책 ID를 `IDENTITY_VERIFIER_POLICY_ID`에 넣기

> 콘솔 로그인/월렛 관련 비밀번호: `omnione123!` (오라클 배포 시 설정값).

---

## 5. 팀원이 연결하는 법

### A. 모바일/프론트에서 Verifier API 직접 호출 (가장 흔함)

- Base: `http://168.138.36.235:8092/verifier/api/v1/`
- `request-offer-qr`에 `policyId` 실어 호출 → 받은 offer로 QR/딥링크 구성 → OmniOne 지갑앱이 스캔 → `confirm-verify`로 결과 확인.
- CORS 주의: 브라우저에서 직접 호출 시 막힐 수 있으니 **자기 서버(API 라우트) 경유** 권장.

### B. Verifier Admin 콘솔 접속 (정책 등록·상태 확인)

- `http://168.138.36.235:8092/` 브라우저 접속. 정책 만들고 검증 이력 확인.

### C. 서버 SSH 접속 (운영·디버깅)

1. 키 파일 `oracle-farmfi.key`를 받아 `~/.ssh/`에 두고 `chmod 600`
2. `ssh -i ~/.ssh/oracle-farmfi.key opc@168.138.36.235`
3. 9001 오케스트레이터 대시보드는 터널로: `ssh -i ~/.ssh/oracle-farmfi.key -L 9001:localhost:9001 opc@168.138.36.235` → 브라우저 `http://localhost:9001`

### D. 서버 재부팅 시 재기동 (자동시작 없음)

```bash
cd ~/did-orchestrator-server/source/did-orchestrator-server
sudo nohup java -jar did-orchestrator-server-2.0.0.jar > ~/orchestrator.log 2>&1 &
# 그다음 오케스트레이터 API로 startup/postgre → startup/besu → startup/all 순서 호출
```

부팅에 5분+ 걸림(1 OCPU). 8092가 `UP` 될 때까지 대기.

---

## 6. 방화벽·보안 (중요)

- **개방한 것**: 8092/tcp — OS `firewalld`(`firewall-cmd --add-port=8092/tcp`) + **OCI 콘솔 보안리스트 인그레스**(0.0.0.0/0). 둘 다 열려야 외부 접근됨(실측 확인).
- ⚠️ **8092는 Verifier Admin 콘솔까지 인터넷에 노출**된다. 데모용으로만. 끝나면:
  - OCI 보안리스트에서 8092 인그레스 삭제, 또는 소스 CIDR 제한
  - `sudo firewall-cmd --permanent --remove-port=8092/tcp && sudo firewall-cmd --reload`
- IP는 ephemeral이라 **인스턴스 재생성 시 바뀐다** — URL 하드코딩 대신 env로.

---

## 7. 오늘 검증한 것 (2026-07-21)

- ✅ SSH 접속, 8개 엔티티 `UP` 확인
- ✅ 포트→서비스 매핑 확정(jar 경로로)
- ✅ Verifier API prefix `/verifier/api/v1/` 확인
- ✅ `request-offer-qr` 필드명 `policyId` 확정, 정책 미등록 상태 확인
- ✅ 8092 외부 개방(방화벽+보안리스트) → 내 PC에서 루트 `200`(0.1s) 도달
- ⬜ VP 정책 등록 (Admin) — 미완
- ⬜ `OmniOneVerifier` 구현 + Vercel 환경변수 — 미완

관련 메모: 서버 상세는 `~/.claude/.../project_farmfi_oracle_server.md`.
