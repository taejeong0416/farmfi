# 신원과 서명 — 왜 다른 주체가 하는가

한 줄로: **모바일 신분증은 "누구인지"만 증명하고, 체인에 글씨를 쓰는 건 서버 운영지갑이 한다.**
둘은 이름에 다 "지갑"이 붙지만 같은 물건이 아니다.

이 문서는 그 경계를 코드 밖의 말로 적는다. 구현은 `architecture.md` 5장·9장에 있다.

## 1. 왜 나눴나 — 나눈 게 아니라 원래 다른 물건이다

모바일 신분증 지갑(OmniOne / 모바일신분증 앱)은 **자격증명을 보관하고 제출하는** 도구다.
운전면허증을 꺼내 보여주는 일까지가 그 SDK의 범위고, 블록체인 트랜잭션에 서명하는 기능은
**아예 없다.** 확인한 사실이지 설계 선택이 아니다.

그래서 이렇게 갈린다.

| | 하는 일 | 누가 | 무엇으로 |
|:---|:---|:---|:---|
| 신원 | 실명·생년·CI 확인 | 사용자 본인 | 정부 모바일 운전면허증 |
| 서명 | 체인에 상태 기록 | 서버 | 운영지갑 개인키 하나 |

`architecture.md` 5.6이 그 둘을 잇는 지점이다 — 검증이 끝나면 서버가
`FarmToken.registerIdentity(wallet, didHash)`로 **지갑 주소와 신원 해시를 묶는다.**
신원은 신원대로 받고, 그 결과를 체인에 적는 건 다시 운영지갑이다.

## 2. 신원 — 지금은 OACX다

`IDENTITY_PROVIDER` 환경변수가 구현체를 고른다. 셋 다 `IdentityVerifier` 인터페이스를 구현해서
도메인 코드는 어느 쪽이 붙었는지 모른다.

| 값 | 클래스 | 딥링크 | 상태 |
|:---|:---|:---|:---|
| `oacx` | `OacxVerifier` (`verifier.ts:340`) | `mobileid://` | **현재 프로덕션** |
| `opendid` | `OmniOneVerifier` (`verifier.ts:202`) | `omnione://` | 자체 호스팅 Verifier, 대기 |
| (미설정) | `StubVerifier` | `omnione://` | 개발용. 프로덕션에서 예외로 막힘 |

OACX는 provider `comdl_v1.5` 고정 — **모바일 운전면허증**이다.
주민등록증(`comrc`)은 제공처 응답이 `status=n`이라 못 쓴다.

문서·발표에 쓸 문장은 이렇게 적는 게 정확하다:

> 신원 자격증명은 OACX(라온시큐어)를 통한 정부 모바일 운전면허증 검증으로 처리하며,
> BESU 트랜잭션은 서버 운영지갑이 서명합니다.

"OmniOne Wallet으로 신원을 확인한다"고 쓰면 지금 붙어 있는 경로와 어긋난다.
`OmniOneVerifier`는 코드에 살아 있지만 선택되지 않는다.

## 3. 서명 — 운영지갑 하나뿐

체인에 쓰는 길은 `onchain.ts`의 `getClients()` 하나로 모인다.
그 안에서 개인키를 계정으로 바꾸는 줄이 전부다:

```ts
const account = privateKeyToAccount(PRIVATE_KEY!);   // onchain.ts:100
```

이 계정이 서명하는 함수는 넷이다.

| 함수 | 위치 | 언제 |
|:---|:---|:---|
| `verifyMilestone` | `onchain.ts:126` | 마일스톤 검증 통과를 온체인에 기록 |
| `releaseTranche` | `onchain.ts:143` | 트랜치 자동집행 |
| `triggerTimeoutFailure` | `onchain.ts:162` | 마감 경과 시 실패 전환 |
| `mint` | `chain-relay.ts:197` | 입금 확인 후 보유 구좌 발행 |

나머지 `getClients()` 호출부 넷은 `{ pub }`만 꺼내 쓰는 **읽기**다 — 서명하지 않는다
(`readMilestoneDeadline`, `readProjectFailed`, `sweepReceipts`, `reconcileHoldings`).

## 4. 투자자 수탁 지갑은 서명하지 않는다

투자자마다 지갑이 하나씩 생기지만(`custody.ts`), 그건 **받을 주소**를 만들기 위한 것이다.

```ts
const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);
chainAddress: account.address,      // 주소만 꺼내 쓰고
keyRef: sealPrivateKey(privateKey), // 키는 AES-256-GCM으로 봉인
```

`custody.ts`에는 `createWalletClient`가 없다. 즉 그 키로 트랜잭션을 보내는 코드 자체가 없다.
발행은 운영지갑이 **수탁 주소를 수신자로 지정해서** `mint`를 부르는 형태다.

투자자는 주소도 개인키도 가스비도 만지지 않는다. 지갑 주소는 admin 응답에만 싣는다.

## 5. 중계와 터널 — 왜 국내 컴퓨터를 거치나

여기가 지금 구조에서 가장 설명이 필요한 부분이다.

**OACX 서버는 한국 IP만 받는다.** 우리 사이트는 Vercel에서 도는데 그 서버가 미국에 있다.
그래서 배포본이 OACX를 부르면 연결이 조용히 죽는다 — 에러 메시지도 없이 타임아웃이다.

실측:

| 출발지 | 결과 |
|:---|:---|
| 노트북 (한국 회선) | HTTP 응답 **0.066초** |
| Vercel (미국) | connect timeout 10초 |
| Oracle (**오사카**) | connect timeout 25초 |

서버는 멀쩡하다. 방화벽이 국외 연결을 버린다. Oracle 인스턴스가 일본 리전이라
그걸 우회로로 쓰는 길도 없었다.

그래서 **한국 회선에 있는 컴퓨터를 대리인으로 세웠다.**

- **중계(relay)** — `scripts/oacx-relay.mjs`. 국내 회선 컴퓨터에서 도는 작은 서버다.
  Vercel이 "이거 OACX에 물어봐줘" 하면 그 컴퓨터가 대신 갔다 와서 답을 넘긴다.
- **터널(tunnel)** — `cloudflared`. 그 컴퓨터는 공유기 뒤에 있어 인터넷에서 부를 주소가 없다.
  터널이 임시 공개 주소를 만들고 거기서 그 컴퓨터까지 길을 뚫는다.

```
사용자 ─→ farmfi.co.kr (Vercel, 미국)
              │  OACX_BASE_URL = 터널 주소
              ▼
        cloudflared 터널
              ▼
   oacx-relay.mjs (국내 회선 컴퓨터)
              ▼
   cx.raonsecure.co.kr:18543  ✅
```

중계가 열린 프록시가 되지 않게 잠갔다 — 목적지 호스트 고정, `/oacx/api/v1.0/` 경로만 통과,
상수시간 토큰 비교, 로컬 바인드, 1MB 본문 제한.
**개인정보가 지나가므로 요청·응답 본문은 로그로 남기지 않는다.** OACX 파싱 API에 자체 인증이
없어서, 토큰이 유일한 방벽이다.

### 어떻게 띄우나

```bash
./scripts/oacx-up.sh --check   # 준비물 점검만. 배포를 건드리지 않는다
./scripts/oacx-up.sh           # 중계·터널·환경변수·배포까지
```

Ctrl-C면 OpenDID로 되돌리고 정리한다.

**아무 컴퓨터에서나 돌려도 된다.** 조건은 넷이다 — 국내 회선, `cloudflared` 설치,
node 20+, 그리고 **Vercel 팀 `farmfi-web` 멤버**(환경변수를 바꿔야 하므로).
`.vercel/` 링크는 gitignore라 clone한 컴퓨터엔 없지만 스크립트가 만든다.

`--check`가 다섯 줄 다 ✅면 그냥 돌리면 된다. 설치 명령·에러별 대처·인수인계 규칙은
`oacx-status.md`의 "실행 방법"에 있다.

**둘이 동시에 돌리면 안 된다** — 같은 환경변수를 덮어써서 먼저 돌던 쪽이 죽는다.

## 6. 한계 — 알고 쓰는 것들

- **중계는 임시방편이다.** 그 컴퓨터가 꺼지면 본인확인이 끊긴다.
  없애려면 라온시큐어가 IP 제한을 풀거나(Vercel은 고정 IP가 없어 화이트리스트가 불가능),
  한국 리전 서버에 중계를 상주시켜야 한다.
- **터널 주소가 재실행마다 바뀐다.** 고정하려면 Cloudflare named tunnel이 필요하다.
- **운영지갑 개인키가 환경변수에 평문으로 있다.** 수탁 키는 AES-256-GCM으로 봉인하는데
  이것만 안 맞는다. 실서비스 전 KMS/HSM으로 옮겨야 할 항목.
- **Besu RPC 8545가 전체 공개다.** 시연 후 닫는다.
