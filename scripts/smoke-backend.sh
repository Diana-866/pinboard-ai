#!/usr/bin/env bash
# PinPosy backend smoke check.
#
# Verifies the contract of a running backend without touching data: which endpoints
# answer, which require authentication, whether the payment catalogue is served, and
# whether readiness reflects a reachable database. It is meant for staging (UA-066) and
# for a quick check after a deploy.
#
# It never sends credentials unless you pass one, never prints a token, and never writes.
# Exit code 0 means every check passed; 1 means at least one failed; 2 means the script
# was used incorrectly.
set -u

BASE_URL=""
TOKEN=""
EXPECT_READY="any"
TIMEOUT_SECONDS=20

usage() {
  cat <<'USAGE'
Usage: scripts/smoke-backend.sh --base-url <url> [options]

  --base-url <url>     Backend origin, e.g. https://pinboard-ai-backend.onrender.com
  --token <jwt>        Optional user token; when given, /me must answer 200
  --expect-ready ok|fail|any
                       Whether /ready is expected to report a healthy database.
                       Default: any (the check still prints what it found)
  --timeout <sec>      Per-request timeout (default 20)
  -h, --help           This help

Environment alternative: PINPOSY_BASE_URL, PINPOSY_SMOKE_TOKEN.
The token is never echoed. Do not pass a production admin token.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --base-url) BASE_URL="${2:-}"; shift 2 ;;
    --token) TOKEN="${2:-}"; shift 2 ;;
    --expect-ready) EXPECT_READY="${2:-}"; shift 2 ;;
    --timeout) TIMEOUT_SECONDS="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -n "$BASE_URL" ] || BASE_URL="${PINPOSY_BASE_URL:-}"
[ -n "$TOKEN" ] || TOKEN="${PINPOSY_SMOKE_TOKEN:-}"
BASE_URL="${BASE_URL%/}"

if [ -z "$BASE_URL" ]; then
  echo "error: --base-url is required" >&2
  usage >&2
  exit 2
fi
case "$BASE_URL" in
  http://*|https://*) : ;;
  *) echo "error: --base-url must start with http:// or https://" >&2; exit 2 ;;
esac
case "$EXPECT_READY" in
  ok|fail|any) : ;;
  *) echo "error: --expect-ready must be ok, fail or any" >&2; exit 2 ;;
esac
case "$TIMEOUT_SECONDS" in
  ''|*[!0-9]*) echo "error: --timeout must be a positive integer" >&2; exit 2 ;;
esac

FAILURES=0
CHECKS=0

# Prints the status code for a request. The body is discarded on purpose: it can contain
# the answer to a question about a real account.
request_status() {
  local method="$1" path="$2" token="${3:-}"
  local args=(-s -o /dev/null -w '%{http_code}' -X "$method" --max-time "$TIMEOUT_SECONDS")
  if [ -n "$token" ]; then
    args+=(-H "Authorization: Bearer ${token}")
  fi
  curl "${args[@]}" "${BASE_URL}${path}" 2>/dev/null || echo "000"
}

# Fetches a JSON body, bounded, for the few checks that must look at content.
request_body() {
  local path="$1"
  curl -s --max-time "$TIMEOUT_SECONDS" -H 'Accept: application/json' "${BASE_URL}${path}" 2>/dev/null
}

check_status() {
  local label="$1" expected="$2" method="$3" path="$4" token="${5:-}"
  CHECKS=$((CHECKS + 1))
  local actual
  actual="$(request_status "$method" "$path" "$token")"
  if [ "$actual" = "$expected" ]; then
    printf 'PASS  %-42s %s -> %s\n' "$label" "$method $path" "$actual"
  else
    printf 'FAIL  %-42s %s -> %s (expected %s)\n' "$label" "$method $path" "$actual" "$expected"
    FAILURES=$((FAILURES + 1))
  fi
}

check_status_one_of() {
  local label="$1" expected_list="$2" method="$3" path="$4"
  CHECKS=$((CHECKS + 1))
  local actual
  actual="$(request_status "$method" "$path")"
  case " $expected_list " in
    *" $actual "*) printf 'PASS  %-42s %s -> %s\n' "$label" "$method $path" "$actual" ;;
    *)
      printf 'FAIL  %-42s %s -> %s (expected one of: %s)\n' "$label" "$method $path" "$actual" "$expected_list"
      FAILURES=$((FAILURES + 1))
      ;;
  esac
}

echo "PinPosy backend smoke check"
echo "target: ${BASE_URL}"
echo

# Liveness is dependency-free by design: it must answer even when the database is down.
check_status "liveness" "200" "GET" "/health"

# Readiness reports the database separately, so both outcomes are informative.
ready="$(request_body "/ready")"
CHECKS=$((CHECKS + 1))
case "$ready" in
  *'"status":"ok"'*|*'"status": "ok"'*)
    echo "INFO  readiness reports a healthy dependency set"
    ready_state="ok"
    ;;
  *)
    echo "INFO  readiness is not ok: $(printf '%s' "$ready" | cut -c1-200)"
    ready_state="fail"
    ;;
esac
if [ "$EXPECT_READY" = "any" ]; then
  printf 'PASS  %-42s GET /ready -> %s\n' "readiness (informational)" "$ready_state"
elif [ "$EXPECT_READY" = "$ready_state" ]; then
  printf 'PASS  %-42s GET /ready -> %s\n' "readiness" "$ready_state"
else
  printf 'FAIL  %-42s GET /ready -> %s (expected %s)\n' "readiness" "$ready_state" "$EXPECT_READY"
  FAILURES=$((FAILURES + 1))
fi

# Public catalogues must be served without authentication: the pricing page reads them.
check_status "payment catalogue" "200" "GET" "/billing/plans"
check_status "credit pack catalogue" "200" "GET" "/billing/credit-packs"

# Every customer route must refuse an anonymous request. 401 is the contract; a 200 here
# would be a security defect, and a 5xx would be a broken dependency.
for path in /me /projects /boards /schedule /analytics/summary; do
  check_status "anonymous access refused" "401" "GET" "$path"
done

# Admin surfaces must not answer an anonymous caller either.
check_status "anonymous admin refused" "401" "GET" "/admin/stats"

# The webhook must reject an unsigned request rather than accept it.
webhook_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT_SECONDS" \
  -X POST -H 'Content-Type: application/x-www-form-urlencoded' --data 'order_id=smoke' \
  "${BASE_URL}/billing/webhook" 2>/dev/null || echo "000")"
CHECKS=$((CHECKS + 1))
case "$webhook_status" in
  403|400)
    printf 'PASS  %-42s POST /billing/webhook -> %s\n' "unsigned webhook refused" "$webhook_status"
    ;;
  *)
    printf 'FAIL  %-42s POST /billing/webhook -> %s (expected 403 or 400)\n' "unsigned webhook refused" "$webhook_status"
    FAILURES=$((FAILURES + 1))
    ;;
esac

if [ -n "$TOKEN" ]; then
  # With a real user token the authenticated surface must work. The body is not printed:
  # it is customer data.
  CHECKS=$((CHECKS + 1))
  me_status="$(request_status GET /me "$TOKEN")"
  if [ "$me_status" = "200" ]; then
    printf 'PASS  %-42s GET /me -> 200\n' "authenticated profile"
  else
    printf 'FAIL  %-42s GET /me -> %s (expected 200)\n' "authenticated profile" "$me_status"
    FAILURES=$((FAILURES + 1))
  fi
else
  echo "SKIP  authenticated profile (no --token given)"
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "RESULT: PASS (${CHECKS} checks)"
  exit 0
fi
echo "RESULT: FAIL (${FAILURES} of ${CHECKS} checks failed)"
exit 1
