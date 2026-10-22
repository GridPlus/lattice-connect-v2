#!/usr/bin/env bash
# Usage: smoke.sh IMAGE
# Runs the relay image against a local mosquitto broker and a fake Lattice1 agent.
# Set SMOKE_SLOW=1 to include the 120 s device timeout check.
set -uo pipefail

export IMAGE=${1:?usage: smoke.sh IMAGE}
export SMOKE_PORT=${SMOKE_PORT:-18080}
cd "$(dirname "$0")"

BASE="http://127.0.0.1:${SMOKE_PORT}"
FAILS=0

dc() { docker compose -f compose.yml "$@"; }
logs() { dc logs --no-log-prefix "$1" 2>/dev/null; }
count() { logs "$1" | grep -c "$2"; }

pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILS=$((FAILS + 1)); }

wait_for() {
  local svc=$1 pattern=$2 min=$3 timeout=${4:-30}
  for _ in $(seq "$timeout"); do
    [ "$(count "$svc" "$pattern")" -ge "$min" ] && return 0
    sleep 1
  done
  echo "timed out waiting for $min x '$pattern' in $svc"
  return 1
}

post() {
  curl -s --max-time "${3:-10}" -H "Content-Type: ${2:-application/json}" -d "$1" "$BASE/dev1"
}

relay_ok() {
  local out
  out=$(post '{"data":{"data":[1,2,3]}}')
  [ "$(jq -c '{status,message}' <<<"$out" 2>/dev/null)" = '{"status":200,"message":"030201"}' ]
}

wait_ready() {
  wait_for connect "MQTT client connected" "$1" && wait_for fake-agent "agent subscribed" "$2"
}

cleanup() { dc down -v --remove-orphans >/dev/null 2>&1; }
trap cleanup EXIT

cleanup
echo "== image: $IMAGE"
dc up -d >/dev/null 2>&1 || { echo "compose up failed"; exit 1; }
wait_ready 2 1 || { logs connect | tail -20; exit 1; }

# 1
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/")
[ "$code" = 200 ] && pass "1 GET / -> 200" || fail "1 GET / -> $code"

# 2: four requests, so cluster round robin reaches both workers
ok=0; for _ in 1 2 3 4; do relay_ok && ok=$((ok + 1)); done
[ "$ok" = 4 ] && pass "2 relay round trip (4/4)" || fail "2 relay round trip ($ok/4)"

# 3
out=$(post '{}')
[ "$(jq -r .status <<<"$out" 2>/dev/null)" = 400 ] && pass "3 empty body -> status 400" || fail "3 empty body -> $out"

# 4
out=$(post 'hello' text/plain)
[ "$(jq -r .status <<<"$out" 2>/dev/null)" = 400 ] && pass "4 text/plain body -> status 400" || fail "4 text/plain body -> $out"
ok=0; for _ in 1 2; do relay_ok && ok=$((ok + 1)); done
[ "$ok" = 2 ] && pass "4 workers still relay after bad body" || fail "4 workers after bad body ($ok/2)"

# 5: informational, the expected value depends on the entrypoint
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/provision")
echo "INFO  5 GET /provision -> $code"

# 6
connected=$(count connect "MQTT client connected"); subscribed=$(count fake-agent "agent subscribed")
dc restart broker >/dev/null 2>&1
if wait_ready $((connected + 2)) $((subscribed + 1)) && relay_ok; then
  pass "6 relay recovers after broker restart"
else
  fail "6 relay recovers after broker restart"
fi

# 7
connected=$(count connect "MQTT client connected"); subscribed=$(count fake-agent "agent subscribed")
RELAY_PASS=wrong dc up -d broker >/dev/null 2>&1
sleep 10
refused=$(count broker "not authori")
RELAY_PASS=pass dc up -d broker >/dev/null 2>&1
if [ "$refused" -gt 0 ] && wait_ready $((connected + 2)) $((subscribed + 2)) && relay_ok && relay_ok; then
  pass "7 relay recovers after broker refused credentials ($refused refusals)"
else
  fail "7 relay recovers after broker refused credentials ($refused refusals)"
fi

# 8
subscribed=$(count fake-agent "agent subscribed")
AGENT_DELAY_MS=0 dc up -d fake-agent >/dev/null 2>&1
wait_for fake-agent "agent subscribed" 1 >/dev/null
sleep 1
ok=0; for _ in $(seq 20); do relay_ok && ok=$((ok + 1)); done
[ "$ok" = 20 ] && pass "8 instant agent replies (20/20)" || fail "8 instant agent replies ($ok/20)"

# 9
if [ "${SMOKE_SLOW:-0}" = 1 ]; then
  out=$(curl -s --max-time 130 -H 'Content-Type: application/json' -d '{"data":{"data":[1]}}' "$BASE/silent")
  [ "$(jq -r .status <<<"$out" 2>/dev/null)" = 500 ] && pass "9 device timeout -> status 500" || fail "9 device timeout -> $out"
fi

died=$(count connect "died")
[ "$died" = 0 ] && pass "no worker died" || fail "$died worker exit(s) logged"

echo "== $FAILS failure(s)"
[ "$FAILS" = 0 ]
