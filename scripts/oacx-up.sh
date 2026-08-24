#!/usr/bin/env bash
# OACX 국내 중계를 띄우고 배포본이 그걸 보게 만든다.
#
# 시연 당일 이거 하나만 실행한다. 끝나면 Ctrl-C — OpenDID로 되돌리고 정리한다.
# 중계가 이 컴퓨터(국내 회선)에서 나가므로 컴퓨터가 켜져 있어야 배포본의
# 본인확인이 산다. 되돌리면 이 컴퓨터와 무관하게 OpenDID로 돈다.
#
#   ./scripts/oacx-up.sh --check   준비물만 점검하고 끝낸다 (배포를 건드리지 않는다)
#   ./scripts/oacx-up.sh           중계·터널·배포까지 올린다
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
PORT="${OACX_RELAY_PORT:-8788}"

# Vercel 링크(.vercel/)는 gitignore라 clone한 컴퓨터엔 없다. 그래서 프로젝트·팀을
# 여기 박아두고 매번 --scope로 넘긴다. 링크가 없으면 아래 preflight가 만든다.
# 이건 시크릿이 아니다 — 접근 권한은 로그인 계정이 통제한다.
VERCEL_PROJECT="farmfi-web"
VERCEL_SCOPE="ptj020416-5870s-projects"

# vercel 명령은 반드시 frontend/에서 실행한다. 루트는 링크 대상이 아니라
# "Your codebase isn't linked to a project"로 죽는다.
vc() { (cd "$ROOT/frontend" && npx --yes vercel --scope "$VERCEL_SCOPE" "$@"); }

say()  { printf '  %s\n' "$1"; }
fail() { printf '  ❌ %s\n' "$1"; FAILED=1; }

preflight() {
  FAILED=0
  echo "▸ 준비물 점검"

  command -v node >/dev/null       && say "✅ node $(node -v)" \
                                   || fail "node 없음 — https://nodejs.org 에서 설치"
  command -v cloudflared >/dev/null && say "✅ cloudflared" \
                                   || fail "cloudflared 없음 — mac: brew install cloudflared / win: winget install Cloudflare.cloudflared"

  # 국내 회선인가. OACX는 국외 연결을 조용히 버린다 — 404가 와도 '도달'이면 통과다.
  local t0 code
  t0=$(date +%s)
  code=0
  curl -sS -m 10 -o /dev/null "https://cx.raonsecure.co.kr:18543/oacx/api/v1.0/" >/dev/null 2>&1 || code=$?
  if [ "$code" -eq 28 ]; then
    fail "OACX에 못 닿는다 ($(( $(date +%s) - t0 ))초 타임아웃) — 국내 회선인지 확인. VPN/해외망이면 안 된다"
  else
    say "✅ OACX 도달 (국내 회선)"
  fi

  if vc whoami >/dev/null 2>&1; then
    say "✅ vercel 로그인: $(vc whoami 2>/dev/null | grep -v "^$" | tail -1)"
  else
    fail "vercel 로그인 필요 — npx vercel login (팀 '$VERCEL_SCOPE' 멤버여야 한다)"
  fi

  if [ ! -f "$ROOT/frontend/.vercel/project.json" ]; then
    say "… vercel 링크 생성 중"
    if vc link --yes --project "$VERCEL_PROJECT" >/dev/null 2>&1; then
      say "✅ vercel 링크 생성됨"
    else
      fail "vercel 링크 실패 — 팀 '$VERCEL_SCOPE'의 '$VERCEL_PROJECT' 접근 권한이 있는지 확인"
    fi
  else
    say "✅ vercel 링크 있음"
  fi

  [ "$FAILED" -eq 0 ] || { echo; echo "위 항목을 먼저 해결해라."; exit 1; }
  echo
}

preflight
if [ "${1:-}" = "--check" ]; then
  echo "준비 끝. 실제로 띄우려면 인자 없이 다시 실행해라."
  exit 0
fi

RUN="$(mktemp -d)"
TOKEN="${OACX_RELAY_TOKEN:-$(openssl rand -hex 32)}"

cleanup() {
  echo
  echo "▸ 정리 중 — 본인확인을 OpenDID로 되돌린다"
  printf 'opendid' | vc env add IDENTITY_PROVIDER production --sensitive --force >/dev/null 2>&1 || true
  vc --prod --yes >/dev/null 2>&1 || true
  kill "${RELAY_PID:-0}" "${TUNNEL_PID:-0}" 2>/dev/null || true
  rm -rf "$RUN"
  echo "▸ 되돌렸다. 배포본은 이 컴퓨터 없이도 돈다."
}
trap cleanup EXIT INT TERM

echo "▸ 중계 기동 (127.0.0.1:$PORT)"
OACX_RELAY_TOKEN="$TOKEN" node scripts/oacx-relay.mjs > "$RUN/relay.log" 2>&1 &
RELAY_PID=$!
sleep 2
curl -fsS -m 5 "http://127.0.0.1:$PORT/healthz" >/dev/null || {
  echo "중계가 안 떴다:"; cat "$RUN/relay.log"
  echo "포트 $PORT 가 이미 쓰이는 중일 수 있다: lsof -ti:$PORT"
  exit 1
}

echo "▸ 터널 여는 중"
cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate > "$RUN/tunnel.log" 2>&1 &
TUNNEL_PID=$!
URL=""
for _ in $(seq 1 40); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$RUN/tunnel.log" | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 1
done
[ -n "$URL" ] || { echo "터널 URL을 못 얻었다:"; tail -20 "$RUN/tunnel.log"; exit 1; }
echo "  $URL"

curl -fsS -m 20 "$URL/healthz" >/dev/null || { echo "터널이 중계에 닿지 않는다"; exit 1; }

echo "▸ 배포 환경에 연결"
printf '%s' "$URL"   | vc env add OACX_BASE_URL production --sensitive --force >/dev/null
printf '%s' "$TOKEN" | vc env add OACX_RELAY_TOKEN production --sensitive --force >/dev/null
printf 'oacx'        | vc env add IDENTITY_PROVIDER production --sensitive --force >/dev/null
vc --prod --yes >/dev/null

echo "▸ 확인"
TOKEN_JWT="$(curl -fsS -m 30 -X POST https://farmfi.co.kr/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"investor@farmfi.test","password":"farmfi123"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')"
DEEPLINK="$(curl -fsS -m 60 -X POST https://farmfi.co.kr/api/identity/offer \
  -H "Authorization: Bearer $TOKEN_JWT" -H 'Content-Type: application/json' -d '{}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("deeplink",""))')"

case "$DEEPLINK" in
  mobileid://*) echo "  ✅ 배포본이 OACX를 탄다 — 실물 모바일 운전면허증" ;;
  *)            echo "  ❌ 딥링크가 mobileid:// 가 아니다: ${DEEPLINK:0:40}"; exit 1 ;;
esac

echo
echo "준비됐다. 이 창을 열어둬라 — 닫으면 본인확인이 끊긴다."
echo "끝내려면 Ctrl-C (자동으로 OpenDID로 되돌린다)"
echo
tail -f "$RUN/relay.log"
