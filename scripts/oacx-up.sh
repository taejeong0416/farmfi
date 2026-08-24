#!/usr/bin/env bash
# OACX 국내 중계를 띄우고 배포본이 그걸 보게 만든다.
#
# 시연 당일 이거 하나만 실행한다. 끝나면 Ctrl-C — OpenDID로 되돌리고 정리한다.
# 중계가 이 노트북(국내 회선)에서 나가므로 노트북이 켜져 있어야 배포본의
# 본인확인이 산다. 되돌리면 노트북과 무관하게 OpenDID로 돈다.
set -euo pipefail

cd "$(dirname "$0")/.."
PORT="${OACX_RELAY_PORT:-8788}"
RUN="$(mktemp -d)"
TOKEN="${OACX_RELAY_TOKEN:-$(openssl rand -hex 32)}"

cleanup() {
  echo
  echo "▸ 정리 중 — 본인확인을 OpenDID로 되돌린다"
  printf 'opendid' | npx --yes vercel env add IDENTITY_PROVIDER production --sensitive --force >/dev/null 2>&1 || true
  (cd frontend && npx --yes vercel --prod --yes >/dev/null 2>&1) || true
  kill "${RELAY_PID:-0}" "${TUNNEL_PID:-0}" 2>/dev/null || true
  rm -rf "$RUN"
  echo "▸ 되돌렸다. 배포본은 노트북 없이도 돈다."
}
trap cleanup EXIT INT TERM

echo "▸ 중계 기동 (127.0.0.1:$PORT)"
OACX_RELAY_TOKEN="$TOKEN" node scripts/oacx-relay.mjs > "$RUN/relay.log" 2>&1 &
RELAY_PID=$!
sleep 2
curl -fsS -m 5 "http://127.0.0.1:$PORT/healthz" >/dev/null || { echo "중계가 안 떴다:"; cat "$RUN/relay.log"; exit 1; }

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
printf '%s' "$URL"   | npx --yes vercel env add OACX_BASE_URL production --sensitive --force >/dev/null 2>&1
printf '%s' "$TOKEN" | npx --yes vercel env add OACX_RELAY_TOKEN production --sensitive --force >/dev/null 2>&1
printf 'oacx'        | npx --yes vercel env add IDENTITY_PROVIDER production --sensitive --force >/dev/null 2>&1
(cd frontend && npx --yes vercel --prod --yes >/dev/null 2>&1)

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
