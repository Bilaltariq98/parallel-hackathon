#!/bin/sh
# Room Radar behind a public Cloudflare quick tunnel, so phones on any network can join.
# The address is random and changes every run. Ctrl-C stops both the tunnel and the server.
# ponytail: quick tunnels have no uptime promise; use a named tunnel on your own domain for a real event.
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-4108}"
LOG="$(mktemp -t roomradar-tunnel)"
# --config /dev/null: an existing ~/.cloudflared/config.yml has its own ingress rules, which make a quick tunnel answer 404.
cloudflared tunnel --config /dev/null --url "http://127.0.0.1:$PORT" --no-autoupdate >"$LOG" 2>&1 &
TUNNEL=$!
trap 'kill $TUNNEL 2>/dev/null; rm -f "$LOG"' EXIT INT TERM
for _ in $(seq 1 30); do
  URL="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | head -1)"
  [ -n "$URL" ] && break
  kill -0 $TUNNEL 2>/dev/null || { echo "cloudflared stopped:"; tail -5 "$LOG"; exit 1; }
  sleep 1
done
[ -n "$URL" ] || { echo "No tunnel address after 30s:"; tail -5 "$LOG"; exit 1; }
echo "Public address: $URL"
PORT="$PORT" PUBLIC_JOIN_URL="$URL/join" python3 server.py
