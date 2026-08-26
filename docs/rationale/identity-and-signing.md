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

## 5. 리전 — 왜 함수가 서울에서 돌아야 하나

**OACX 서버는 한국 IP만 받는다.** 국외에서 부르면 연결이 조용히 죽는다 —
에러 메시지도 없이 타임아웃이다.

실측:

| 출발지 | 결과 |
|:---|:---|
| Vercel 함수 **서울(icn1)** | HTTP 응답 **77ms** |
| 노트북 (한국 회선) | HTTP 응답 0.07초 |
| Vercel 함수 **버지니아(iad1)** | connect timeout 10초 |
| Oracle (오사카) | connect timeout 25초 |

서버는 멀쩡하다. 방화벽이 국외 연결을 버린다.

그래서 **Vercel 함수 리전을 서울로 고정했다.** Settings → Functions → Region → `icn1`.
프로젝트 설정 하나가 전체 함수에 적용되고, 코드의 `preferredRegion`은 Hobby 플랜에서
무시된다(실측). 리전을 바꾸면 그 순간부터 본인확인이 조용히 타임아웃한다.

```
사용자 ─→ farmfi.co.kr (Vercel 함수, 서울 icn1)
              ▼
   cx.raonsecure.co.kr:18543  ✅
```

OACX 결과 토큰과 `cxId`는 서버에만 둔다. 파싱 API(`/trans/{token}`)에 자체 인증이 없어
토큰이 브라우저로 나가면 누구나 그 사람 개인정보를 꺼낼 수 있다.

## 6. 한계 — 알고 쓰는 것들

- **리전이 곧 의존성이다.** Vercel 함수 리전이 서울이 아니게 되는 순간 본인확인이
  멈춘다. 근본 해결은 라온시큐어가 IP 제한을 푸는 것뿐이다 — 서버리스는 고정 IP가
  없어 화이트리스트를 줄 수 없으니 "제한 해제"로 요청해야 한다.
- **운영지갑 개인키가 환경변수에 평문으로 있다.** 수탁 키는 AES-256-GCM으로 봉인하는데
  이것만 안 맞는다. 실서비스 전 KMS/HSM으로 옮겨야 할 항목.
- **Besu RPC 8545가 전체 공개다.** 시연 후 닫는다.
