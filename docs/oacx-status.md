# OACX(실물 모바일 운전면허증) — 서울 리전에서 직접 붙는다

프로덕션 `farmfi.co.kr`이 실제 모바일 운전면허증으로 본인확인한다.
확인: `POST /api/identity/offer` → `mobileid://verify?...` · QR PNG · HTTP 200.

## 왜 리전이 문제인가

`cx.raonsecure.co.kr:18543`은 국내 IP만 통과시킨다. 실측:

| 출발지 | 결과 |
|---|---|
| Vercel 함수 **서울(icn1)** | **HTTP 200 · 77ms** ← 도달 |
| 노트북 (한국 LG U+) | HTTP 200 · 0.07초 ← 도달 |
| Vercel 함수 **버지니아(iad1)** | connect timeout 10초 ← 조용히 드롭 |
| Oracle (오사카) | connect timeout 25초 ← 조용히 드롭 |

서버는 살아 있다. 막는 건 방화벽이고, TCP 연결 자체가 조용히 죽는다.
그래서 **함수가 어느 리전에서 도는지가 본인확인의 생사를 가른다.**

## 구조

```
브라우저 ─→ farmfi.co.kr (Vercel 함수, 서울 icn1)
                 ▼
      cx.raonsecure.co.kr:18543  ✅
```

리전은 Vercel 프로젝트 설정 하나로 정해진다 — Settings → Functions → Region → `icn1`.
코드에 `preferredRegion`을 써도 Hobby 플랜에서는 무시되고 프로젝트 설정이 이긴다(실측).

API로 바꾸려면:

```bash
curl -X PATCH "https://api.vercel.com/v9/projects/<projectId>?teamId=<teamId>" \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"serverlessFunctionRegion":"icn1"}'
```

바꾼 뒤 **재배포해야** 기존 함수에 적용된다.

## 확인하는 법

```bash
curl -s -X POST https://farmfi.co.kr/api/identity/offer -d '{}' -H 'Content-Type: application/json'
```

`qrData`가 `data:image/png;base64,`로 시작하고 `deeplink`가 `mobileid://`면 정상이다.
500이 나면 Vercel 런타임 로그를 본다 — connect timeout이면 리전이 서울이 아니다.

## 환경변수

| 키 | 값 |
|:---|:---|
| `IDENTITY_PROVIDER` | `oacx` (다른 값이면 OACX를 아예 안 탄다) |
| `OACX_PROVIDER` | `comdl_v1.5` — 모바일 운전면허증. 주민등록증(`comrc`)은 제공처가 `status=n`으로 막아놨다 |
| `OACX_BASE_URL` | 없어도 된다. 없으면 `https://cx.raonsecure.co.kr:18543` |
| `IDENTITY_CI_SALT` | CI 해시용 서버 시크릿. 없으면 저장 단계에서 던진다 |

## 개인정보 취급

파싱 API(`/trans/{token}`)에 자체 인증이 없다 — 그 토큰을 쥔 사람은 누구나
개인정보를 읽는다. 그래서 결과 토큰과 `cxId`는 **서버에만** 둔다. 브라우저로
내려가는 건 `txId`·QR·딥링크뿐이다.

저장도 판정만 남긴다 — 실명·생년월일·성인 여부. CI 원문·주소·전화번호는
`IdentityVerification.claims`에 넣지 않는다. CI는 전 서비스 공통 식별자라
원문을 보관하면 유출 시 타 서비스 계정까지 연결된다.

## 되돌리기

```bash
printf 'opendid' | vercel env add IDENTITY_PROVIDER production --sensitive --force
cd frontend && vercel --prod --yes
```

OpenDID(Oracle 자체 발급)로 돌아간다. 흐름은 같고 — QR·딥링크·VP 제출·검증 —
다른 건 "누가 발급한 신분증인가"뿐이다.
