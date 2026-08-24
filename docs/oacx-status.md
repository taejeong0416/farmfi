# OACX(실물 모바일 운전면허증) — 국내 중계로 붙였다

프로덕션 `farmfi.co.kr`이 실제 모바일 운전면허증으로 본인확인한다.
확인: `POST /api/identity/offer` → `mobileid://verify?...`, QR 922바이트, HTTP 200.

## 왜 중계가 필요한가

`cx.raonsecure.co.kr:18543`은 국내 IP만 통과시킨다. 실측:

| 출발지 | 결과 |
|---|---|
| 노트북 (한국 LG U+) | **HTTP 404 · 0.066초** ← 도달 |
| Vercel (미국) | connect timeout 10초 ← 조용히 드롭 |
| Oracle (**오사카**) | connect timeout 25초 ← 조용히 드롭 |

서버는 살아 있다. 66밀리초에 응답한다. 막는 건 방화벽이고, TCP 연결 자체가
조용히 죽는다. Oracle 인스턴스가 일본 리전이라 그걸 프록시로 쓰는 길도 없다.

## 구조

```
브라우저 ─→ farmfi.co.kr (Vercel, 미국)
                 │  OACX_BASE_URL = 터널 URL
                 │  X-Relay-Token
                 ▼
         cloudflared 터널
                 ▼
    scripts/oacx-relay.mjs (노트북, 국내 회선)
                 ▼
      cx.raonsecure.co.kr:18543  ✅
```

`OACX_BASE_URL` 하나로 끼워진다 — `OacxVerifier`의 모든 호출이 `call()` 하나를
지나기 때문이다.

## 시연 당일

```bash
./scripts/oacx-up.sh
```

중계·터널을 띄우고, 배포 환경변수를 맞추고, 배포하고, 딥링크가 `mobileid://`인지
확인까지 한다. **Ctrl-C를 누르면 OpenDID로 되돌리고 정리한다.**

창을 닫으면 배포본의 본인확인이 끊긴다. 노트북이 국내 회선에 붙어 있어야 한다.

## 중계 잠금장치

파싱 API(`/trans/{token}`)에 자체 인증이 없다 — 그 토큰을 쥔 사람은 누구나
개인정보를 읽는다. 그래서 중계 토큰이 유일한 방벽이고, 그만큼 조였다.

- 상위 호스트 고정 — 열린 프록시가 될 수 없다
- 경로는 `/oacx/api/v1.0/` 접두사만 (그 외 403)
- `X-Relay-Token` 32자 이상, `timingSafeEqual` 상수시간 비교 (그 외 401)
- 토큰 없이는 아예 뜨지 않는다
- 127.0.0.1 바인드 — 공개 노출은 터널만
- 본문 1MB 제한
- **본문은 로그로 남기지 않는다** — 이름·생년월일·CI·전화번호·주소가 지나간다.
  401일 때 길이만 찍어 "헤더 없음"과 "값 다름"을 구분한다.

## 되돌리기

```bash
printf 'opendid' | vercel env add IDENTITY_PROVIDER production --sensitive --force
cd frontend && vercel --prod --yes
```

OpenDID(Oracle 자체 발급)로 돌아간다. 흐름은 같고 — QR·딥링크·VP 제출·검증 —
다른 건 "누가 발급한 신분증인가"뿐이다. 노트북과 무관하게 돈다.

## 남은 것

- 터널 URL이 매번 바뀐다. 고정하려면 Cloudflare 계정에 named tunnel을 파고
  `farmfi.co.kr` 하위 호스트를 붙이면 된다. 지금은 재실행마다 재배포한다.
- 라온시큐어가 Vercel 아웃바운드를 열어주면 중계 자체가 필요 없다. 서버리스라
  고정 IP가 없어 대역을 줄 수 없으니 "IP 제한 해제"로 요청해야 한다.
