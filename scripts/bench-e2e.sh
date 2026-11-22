#!/usr/bin/env bash
#
# Сквозная проверка PinPosy на локальном стенде (см. docs/RUNBOOK_LOCAL_TEST_BENCH.md).
#
#   ./scripts/bench-e2e.sh --base-url http://127.0.0.1:4000 --mail-dir /tmp/mail
#
# Что проверяет: готовность базы, регистрацию, письмо, подтверждение почты, вход, профиль,
# создание проекта, отказ в локальном адресе сайта, неверный пароль и повторную регистрацию.
# Данные пишутся только в базу стенда; production и Supabase не затрагиваются.
#
# Лимит авторизации по умолчанию — 10 запросов с одного адреса за 15 минут, поэтому повторный
# прогон подряд может упереться в 429. Для чистой проверки поднимите на стенде
# AUTH_RATE_LIMIT_MAX (например, 50) или перезапустите backend.
#
# Выход: 0 — все проверки прошли, 1 — есть провал, 2 — неверное использование.
set -uo pipefail

BASE_URL="http://127.0.0.1:4000"
MAIL_DIR="/tmp/mail"
TIMEOUT=20
PASSWORD="BenchPass123!"
PASSED=0
FAILED=0

usage() {
  cat <<'USAGE'
Usage: scripts/bench-e2e.sh [options]

  --base-url <url>   Адрес стенда (по умолчанию http://127.0.0.1:4000)
  --mail-dir <dir>   Куда SMTP-приёмник складывает письма (по умолчанию /tmp/mail)
  --timeout <sec>    Таймаут одного запроса (по умолчанию 20)
  -h, --help         Эта справка
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --base-url) BASE_URL="${2:-}"; shift 2 ;;
    --mail-dir) MAIL_DIR="${2:-}"; shift 2 ;;
    --timeout) TIMEOUT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

command -v curl >/dev/null 2>&1 || { echo "error: curl not found" >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "error: python3 not found" >&2; exit 2; }
[ -d "$MAIL_DIR" ] || { echo "error: mail directory not found: $MAIL_DIR" >&2; exit 2; }

EMAIL="bench-$(date -u +%Y%m%d%H%M%S)-$$@pinposy.test"

pass() { PASSED=$((PASSED + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAILED=$((FAILED + 1)); printf 'FAIL  %s\n' "$1"; }

# Ответ печатается без тела: в теле бывают токены, а логи не должны их содержать.
request() {
  local method="$1" path="$2" body="${3:-}" auth="${4:-}"
  local args=(-s -X "$method" -o /tmp/bench-e2e.body -w '%{http_code}' --max-time "$TIMEOUT"
    -H 'Content-Type: application/json')
  [ -n "$auth" ] && args+=(-H "Authorization: Bearer $auth")
  [ -n "$body" ] && args+=(-d "$body")
  curl "${args[@]}" "$BASE_URL$path"
}

body_field() { python3 -c "import json,sys;d=json.load(open('/tmp/bench-e2e.body'));print(d$1)" 2>/dev/null; }

echo "▶ стенд: $BASE_URL, письма: $MAIL_DIR, аккаунт: $EMAIL"

ready="$(request GET /ready)"
[ "$ready" = "200" ] && pass "готовность базы (/ready)" || fail "готовность базы (/ready -> $ready)"

su=(/tmp/mail/*.eml)
BEFORE=$(ls "$MAIL_DIR"/*.eml 2>/dev/null | wc -l | tr -d ' ')

code="$(request POST /register "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Проверка\",\"surname\":\"Стенд\",\"preferred_language\":\"ru\",\"terms_accepted\":true}")"
if [ "$code" = "200" ]; then
  pass "регистрация (200)"
else
  fail "регистрация (ожидался 200, получен $code)"
fi
[ "$(body_field "['verificationEmailSent']")" = "True" ] && pass "письмо подтверждения отправлено" || fail "письмо подтверждения не отправлено"

AFTER=$(ls "$MAIL_DIR"/*.eml 2>/dev/null | wc -l | tr -d ' ')
TOKEN=""
if [ "$AFTER" -gt "$BEFORE" ]; then
  TOKEN="$(python3 - "$MAIL_DIR" <<'PY'
import email, glob, re, sys
files = sorted(glob.glob(sys.argv[1] + "/*.eml"))
msg = email.message_from_bytes(open(files[-1], "rb").read())
for part in msg.walk():
    if part.get_content_type() == "text/plain":
        match = re.search(r"token=([A-Za-z0-9_-]+)", part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "replace"))
        if match:
            print(match.group(1))
            break
PY
)"
fi
if [ -n "$TOKEN" ]; then pass "токен подтверждения извлечён из письма"; else fail "письмо не найдено или токен не извлечён"; fi

if [ -n "$TOKEN" ]; then
  code="$(request POST /verify-email "{\"token\":\"$TOKEN\"}")"
  [ "$code" = "200" ] && pass "подтверждение почты (200)" || fail "подтверждение почты (получен $code)"
fi

SESSION=""
code="$(request POST /login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")"
if [ "$code" = "200" ]; then
  pass "вход (200)"
  SESSION="$(body_field "['token']")"
else
  fail "вход (ожидался 200, получен $code)"
fi

if [ -n "$SESSION" ]; then
  code="$(request GET /me "" "$SESSION")"
  [ "$code" = "200" ] && pass "профиль (/me 200)" || fail "профиль (/me -> $code)"
  [ "$(body_field "['email_verified']")" = "True" ] && pass "почта отмечена подтверждённой" || fail "почта не подтверждена в профиле"

  code="$(request POST /projects '{"website_url":"https://example.com","niche":"home decor"}' "$SESSION")"
  [ "$code" = "201" ] && pass "создание проекта (201)" || fail "создание проекта (ожидался 201, получен $code)"

  code="$(request POST /projects '{"website_url":"http://127.0.0.1/admin"}' "$SESSION")"
  [ "$code" = "422" ] && pass "локальный адрес сайта отклонён (422)" || fail "локальный адрес сайта принят ($code)"
fi

code="$(request POST /login "{\"email\":\"$EMAIL\",\"password\":\"WrongPass123!\"}")"
[ "$code" = "401" ] && pass "неверный пароль отклонён (401)" || fail "неверный пароль ($code)"

code="$(request POST /register "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"terms_accepted\":true}")"
case "$code" in
  409) pass "повторная регистрация отклонена (409)" ;;
  429) echo "INFO  повторная регистрация: сработал лимит попыток (429), проверка дубля не выполнена" ;;
  *) fail "повторная регистрация (ожидался 409, получен $code)" ;;
esac

echo "────────"
echo "PASS=$PASSED FAIL=$FAILED"
[ "$FAILED" -eq 0 ]
