# OACX(실제 모바일 신분증) 전환 — 막힌 지점

## 결론

**로컬에서는 되고 Vercel에서는 안 된다.** 라온시큐어 해커톤 서버가 접근을
제한하는 것으로 보인다. 프로덕션은 OpenDID로 되돌려 뒀다.

## 확인한 것

| 환경 | 결과 |
|---|---|
| 로컬(`localhost:3210`) | ✅ QR 914바이트 + `mobileid://` 딥링크 정상 |
| Vercel 프로덕션 | ❌ `ConnectTimeoutError: cx.raonsecure.co.kr:18543 (10s)` |

```
POST /api/identity/offer error: [TypeError: fetch failed]
  [cause]: ConnectTimeoutError: Connect Timeout Error
           (attempted address: cx.raonsecure.co.kr:18543, timeout: 10000ms)
```

같은 코드·같은 요청인데 나가는 IP만 다르다. **IP 화이트리스트**의 전형적인
증상이다. 국내 IP 제한이거나 참가자 IP만 열어둔 구성일 수 있다.

## 지금 설정

| | 값 | 결과 |
|---|---|---|
| 로컬 `.env` | `IDENTITY_PROVIDER=oacx` | 실제 모바일 운전면허증 |
| Vercel 프로덕션 | `IDENTITY_PROVIDER=opendid` | Oracle 자체 OpenDID(8092) |

코드는 둘 다 지원한다(`getVerifier()`). **환경변수 한 줄로 전환된다.**

## 풀려면

1. **라온시큐어에 Vercel 아웃바운드 허용 요청** — 서버리스라 고정 IP가 없어
   대역을 주기 어렵다. "허용 IP 없이 열어달라"가 현실적이다.
2. **Oracle을 프록시로** — Oracle 인스턴스(168.138.36.235)는 국내 IP이고
   이미 OpenDID를 돌린다. 거기에 OACX 중계를 두면 Vercel → Oracle → OACX로
   나간다. 다만 인증 정보가 한 단계 더 지나가고, Oracle이 죽으면 본인확인도
   같이 죽는다.
3. **시연을 로컬에서** — 노트북에서 앱·웹을 띄우면 지금 그대로 실제 운전면허증이
   된다. 가장 확실하지만 배포본과 다른 것을 보여주게 된다.

## 시연 관점

OpenDID 경로도 **모바일 신분증 흐름 자체는 같다** — QR·딥링크·VP 제출·검증.
다른 것은 "누가 발급한 신분증인가"다(우리 자체 발급 vs 정부 발급).

실물 운전면허증을 보여줘야 한다면 **로컬에서 그 부분만** 시연하고 나머지는
배포본으로 하는 게 지금으로선 안전하다.
