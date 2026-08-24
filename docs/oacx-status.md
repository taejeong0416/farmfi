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

## 실행 방법

### 이 컴퓨터에서 (이미 세팅됨)

```bash
./scripts/oacx-up.sh
```

중계·터널을 띄우고, 배포 환경변수를 맞추고, 배포하고, 딥링크가 `mobileid://`인지
확인까지 한다. **Ctrl-C를 누르면 OpenDID로 되돌리고 정리한다.**

창을 닫으면 배포본의 본인확인이 끊긴다. 국내 회선에 붙어 있어야 한다.

### 팀원 컴퓨터에서 처음 돌릴 때

누구 컴퓨터든 **국내 회선**이고 아래 넷이 갖춰지면 된다.

**1. 준비물 설치**

```bash
# macOS
brew install cloudflared
# Windows
winget install Cloudflare.cloudflared
# Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cf.deb && sudo dpkg -i cf.deb
```

node는 20 이상이면 된다. `openssl`·`python3`·`curl`은 mac/리눅스에 기본으로 있다.
Windows는 **Git Bash 또는 WSL**에서 실행해라 — 이 스크립트는 bash다.

**2. 저장소 받기**

```bash
git clone <repo> && cd pnuai-b-01-b301
```

`npm install`은 필요 없다. 중계는 Node 내장 모듈만 쓰고 vercel CLI는 `npx`로 받는다.

**3. Vercel 로그인**

```bash
npx vercel login
```

**팀 `ptj020416-5870s-projects`의 `farmfi-web` 멤버여야 한다.** 아니면 환경변수를
못 바꿔서 4번에서 막힌다. 초대는 프로젝트 소유자가 Vercel 대시보드에서 보낸다.

`.vercel/` 링크 파일은 gitignore라 clone한 컴퓨터엔 없다. 스크립트가 알아서 만든다.

**4. 점검 후 실행**

```bash
./scripts/oacx-up.sh --check   # 준비물만 확인. 배포를 건드리지 않는다
./scripts/oacx-up.sh           # 실제로 띄운다
```

`--check`가 다섯 줄 전부 ✅면 그대로 돌리면 된다.

```
▸ 준비물 점검
  ✅ node v24.14.0
  ✅ cloudflared
  ✅ OACX 도달 (국내 회선)
  ✅ vercel 로그인: ptj020416-5870
  ✅ vercel 링크 있음
```

### 막히는 지점

| 증상 | 원인·해결 |
|:---|:---|
| `❌ OACX에 못 닿는다` | 해외망·VPN. VPN을 끄고 국내 회선으로. 학교 방화벽이 18543 포트를 막을 수도 있다 — 휴대폰 핫스팟으로 바꿔봐라 |
| `❌ vercel 로그인 필요` | `npx vercel login`. 이미 로그인했는데 뜨면 팀 멤버가 아닌 것 |
| `❌ vercel 링크 실패` | `farmfi-web` 접근 권한 없음. 소유자에게 초대 요청 |
| `중계가 안 떴다` | 포트 8788 충돌. `lsof -ti:8788 \| xargs kill` 하거나 `OACX_RELAY_PORT=8799 ./scripts/oacx-up.sh` |
| `터널 URL을 못 얻었다` | cloudflared가 밖으로 못 나간다. 방화벽 확인 |
| `❌ 딥링크가 mobileid:// 가 아니다` | 배포가 아직 안 퍼졌다. 30초 뒤 재시도 |

### 넘길 때

**두 사람이 동시에 돌리면 안 된다.** 같은 환경변수를 덮어써서 나중 사람 터널만 살고
먼저 돌던 쪽은 죽는다. 넘길 때는 앞사람이 Ctrl-C로 내리고, 뒷사람이 올려라.

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
