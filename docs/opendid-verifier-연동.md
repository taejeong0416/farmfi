# OpenDID 신원인증 연동 가이드 (오라클 자체호스팅, 실연동 완료)

> 2026-07-21 완성. 오라클에 OmniOne OpenDID 2.0.0 전체 네트워크를 구축하고,
> 발급·검증 정책까지 등록해 **우리 앱이 실제 Verifier에서 검증 QR을 받는 것까지 실연동**했다.
> DID 신원인증(KYC)은 이메일+비밀번호 로그인과 **별개**다 — 로그인이 아니라 실명·성인 확인용.

---

## 1. 한 줄 요약

오라클(`168.138.36.235`)에 OpenDID 풀스택(TAS·Issuer·Verifier·CAS·Wallet)이 **전부 체인 등록·ACTIVATE** 상태로 가동 중. VP 검증 정책까지 등록해서, 앱이 `request-offer-qr`를 호출하면 **실제 VerifyOffer(QR)**가 나온다. 유일한 미완은 QR을 스캔할 **최종 사용자 지갑앱**(OpenDID는 앱을 배포 안 하고 SDK만 줌 → 별도 안드로이드 빌드 필요).

---

## 2. 접속·서버

- **서버**: Oracle Cloud ARM, `168.138.36.235` (ap-osaka-1), 유저 `opc`, Oracle Linux 9.7, 1 OCPU/6GB
- **SSH**: `ssh -i ~/.ssh/oracle-farmfi.key opc@168.138.36.235`
- **구성**: `~/did-orchestrator-server/source/did-orchestrator-server/`에서 orchestrator가 엔티티 jar 기동. Postgres = 도커 `postgre-opendid`(호스트 5430). 로컬 Besu 체인 = 도커 `opendid-besu-node`(chainId 1337).
- **관리자 콘솔 로그인**(TAS/Issuer/Verifier 공통): `admin@opendid.omnione.net` / `Farmfi2026!`

### 포트 맵

| 포트 | 서비스 | 외부개방(데모용) |
|---|---|---|
| **8092** | **Verifier** ← 앱이 붙는 곳 | ✅ 유지 |
| **8099** | **Demo 서버** ← 라이브 발급/검증 QR 시연 | ✅ 유지 |
| 8090 | TAS (Trust Agent) | ✗ 데모 후 닫음 |
| 8091 | Issuer | ✗ 데모 후 닫음 |
| 8094 | CAS / 8095 Wallet / 8093 API / 8099 Demo(내부) | ✗ |
| 9001 | Orchestrator 대시보드 | SSH 터널로만 |

> ⚠️ 데모 종료 후 8092·8099도 닫거나 소스 CIDR 제한 권장. OCI 콘솔 보안리스트 + `firewall-cmd`(둘 다).
> 재기동: `sudo kill <pid>` → `sudo bash -c "setsid java -jar <jar> --server.port=<p> --spring.config.additional-location=file:<dir>/application.yml </dev/null >log 2>&1 &"` (부팅 ~75s). Besu/postgres는 `--restart unless-stopped` 걸어둠.

---

## 3. Verifier 연결 (앱이 쓰는 것)

- **Base**: `http://168.138.36.235:8092`, API prefix `/verifier/api/v1/`
- **VP 정책 ID**: `9c4a780e-af30-4f85-a49b-b188e8e10456`
- **핵심 엔드포인트**: `POST /verifier/api/v1/request-offer-qr` body `{"policyId":"9c4a780e-..."}` → `{txId, payload:{offerId,type:VerifyOffer,mode,device,service,endpoints,validUntil}}`
- 나머지: `request-verify`(지갑 VP 제출), `confirm-verify`(검증 확정·클레임)

### 앱 배선 (`frontend/src/lib/identity/verifier.ts`)

- `OmniOneVerifier.createOffer` = request-offer-qr 실호출 → QR/deeplink 반환 (구현 완료)
- `.env`: `IDENTITY_PROVIDER=opendid` / `IDENTITY_VERIFIER_URL=http://168.138.36.235:8092` / `IDENTITY_VERIFIER_POLICY_ID=9c4a780e-...`
- 미설정(`stub`)이면 3초 자동인증 목업 → 데모 항상 됨.
- getStatus/getClaims는 로컬 `IdentityVerification` 행 기준(지갑이 confirm-verify 제출 전엔 pending).

---

## 4. 오늘 바닥부터 구축한 크리덴셜 체인

```
① 네트워크 온보딩: TAS 등록(did:omn:tas) → Issuer/CAS/Wallet/Verifier 전부 COMPLETED·ACTIVATE
② 발급: 네임스페이스(org.farmfi.v1.identity, 클레임 user_name/birth_date)
        → VC스키마(FarmFi Identity, name=farmfi-id) → Issue Profile/VC Plan(farmfi-identity-plan)
③ 검증: filter(allowedIssuer did:omn:issuer) → process(Direct/Secp256r1/AES-256-CBC/PKCS5)
        → profile → service/payload(FarmFiVerify) → policy(9c4a780e-...)
```

전부 등록됨. `request-offer-qr` 실동작으로 검증 쪽 end-to-end 확인.

---

## 5. 라이브 데모로 보여줄 수 있는 것 (지갑앱 없이)

| 시연 | URL/방법 |
|---|---|
| **우리 앱 → 실제 검증 QR** | 앱 신원인증 화면(OmniOneVerifier가 실 Verifier 호출) |
| **발급 QR 라이브 생성** | `http://168.138.36.235:8099/` → VC Issuance → "Farmfi 신분증 발급" |
| **검증 QR 라이브 생성** | 데모서버 VP Submission |
| **request-offer-qr 실호출** | `curl -X POST .../verifier/api/v1/request-offer-qr -d '{"policyId":"9c4a780e-..."}'` |

**유일한 미완**: QR 스캔→VC 수령/제출하는 **홀더(지갑앱)**. OpenDID는 앱 미배포, `did-client-sdk-aos`(안드로이드 전용, 헤드리스 불가)로 직접 빌드해야 함 = 별도 안드로이드 개발.

---

## 6. 삽질 로그 (재현/재구축 시 참고)

- **admin 활성화**: 초기 admin은 미등록(비번=sha256("password"), require_password_reset=t). GUI가 비번을 **sha256 해시로 전송**하므로 DB `login_password`에 `sha256("Farmfi2026!")` 저장 + reset 플래그 off.
- **지갑 연결 오류("Failed to connect to wallet")**: 각 서버 `jars/<E>/application.yml`의 `wallet:` 아래 `password: omnione123!` 누락. 추가+재시작으로 해결.
- **TA Registration secret**: TA 마법사 Step1 비번 = `ta.auth.registration-password`(번들 application-auth.yml) = **`VoOyEuOyal`**.
- **Besu OOM**: 6GB 박스라 8 Java + Besu 동시엔 메모리 빠듯. `opendid-besu-node`가 OOM으로 죽어 있던 걸 복구 + `--restart unless-stopped`.
- **admin API 인증 off**(`auth.token.enable: false`) → curl로 CRUD 자동화 가능. namespace/vc-schema는 POST, verifier 쪽(filter/process/profile/policy/payload)은 GUI가 안전(PUT/{id} 매핑 불규칙).
- **VC스키마 이중 URL**: vcSchemaId를 전체 URL로 넣으면 `?name=...?name=...`로 이중화 → demo 폼로드 실패. **vc_schema_id를 `farmfi-id`(순수 name)로** 하면 @id·해석 정상.
- **demo가 plan 안 보임**: demo는 `/vcplan/list/issuer`(WHERE initiate=?)를 조회 → plan을 `issuer_init`로 해야 목록에 뜸(user_init은 안 뜸).

관련 메모: `~/.claude/.../project_farmfi_oracle_server.md`
