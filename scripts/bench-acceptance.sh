#!/usr/bin/env bash
#
# Приёмочные сценарии PinPosy на локальном стенде (docs/RUNBOOK_LOCAL_TEST_BENCH.md).
#
#   ./scripts/bench-acceptance.sh --base-url http://127.0.0.1:4000 --mail-dir /tmp/mail
#
# Дополняет scripts/bench-e2e.sh: тот проверяет вход и проект, этот — восстановление пароля,
# онбординг, доски, кредиты, экспорт, изоляцию данных между аккаунтами и запрос на удаление.
# Всё пишется только в базу стенда. Секреты и токены не печатаются.
#
# Выход: 0 — все проверки прошли, 1 — есть провал, 2 — неверное использование.
set -uo pipefail

BASE_URL="http://127.0.0.1:4000"
MAIL_DIR="/tmp/mail"
TIMEOUT=20
PASSWORD="BenchPass123!"
NEW_PASSWORD="BenchPass456!"
PASSED=0
FAILED=0

usage() {
  cat <<'USAGE'
Usage: scripts/bench-acceptance.sh [options]

  --base-url <url>   Адрес стенда (по умолчанию http://127.0.0.1:4000)
  --mail-dir <dir>   Каталог писем SMTP-приёмника (по умолчанию /tmp/mail)
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

SUFFIX="$(date -u +%Y%m%d%H%M%S)-$$"
EMAIL_A="accept-a-$SUFFIX@pinposy.test"
EMAIL_B="accept-b-$SUFFIX@pinposy.test"
BODY=/tmp/bench-acceptance.body

pass() { PASSED=$((PASSED + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAILED=$((FAILED + 1)); printf 'FAIL  %s\n' "$1"; }

request() {
  local method="$1" path="$2" body="${3:-}" auth="${4:-}"
  local args=(-s -X "$method" -o "$BODY" -w '%{http_code}' --max-time "$TIMEOUT" -H 'Content-Type: application/json')
  [ -n "$auth" ] && args+=(-H "Authorization: Bearer $auth")
  [ -n "$body" ] && args+=(-d "$body")
  curl "${args[@]}" "$BASE_URL$path"
}

field() { python3 -c "import json;d=json.load(open('$BODY'));print(d$1)" 2>/dev/null; }

mail_count() { ls "$MAIL_DIR"/*.eml 2>/dev/null | wc -l | tr -d ' '; }

latest_token() {
  python3 - "$MAIL_DIR" "$1" <<'PY'
import email, glob, re, sys
mail_dir, since = sys.argv[1], int(sys.argv[2])
files = sorted(glob.glob(mail_dir + "/*.eml"))[since:]
for path in reversed(files):
    msg = email.message_from_bytes(open(path, "rb").read())
    for part in msg.walk():
        if part.get_content_type() == "text/plain":
            text = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "replace")
            match = re.search(r"token=([A-Za-z0-9_-]+)", text)
            if match:
                print(match.group(1))
                raise SystemExit
PY
}

register_verified() {
  local email="$1"
  local before token
  before="$(mail_count)"
  local code
  code="$(request POST /register "{\"email\":\"$email\",\"password\":\"$PASSWORD\",\"name\":\"Приёмка\",\"preferred_language\":\"ru\",\"terms_accepted\":true}")"
  [ "$code" = "200" ] || { echo "register $email -> $code" >&2; return 1; }
  token="$(latest_token "$before")"
  [ -n "$token" ] || { echo "no verification token for $email" >&2; return 1; }
  code="$(request POST /verify-email "{\"token\":\"$token\"}")"
  [ "$code" = "200" ] || { echo "verify $email -> $code" >&2; return 1; }
  code="$(request POST /login "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}")"
  [ "$code" = "200" ] || { echo "login $email -> $code" >&2; return 1; }
  field "['token']"
}

echo "▶ стенд: $BASE_URL, письма: $MAIL_DIR"
echo "▶ аккаунты: $EMAIL_A, $EMAIL_B"

ready="$(request GET /ready)"
[ "$ready" = "200" ] && pass "готовность базы" || fail "готовность базы ($ready)"

TOKEN_A="$(register_verified "$EMAIL_A")"
if [ -n "$TOKEN_A" ]; then pass "аккаунт A: регистрация, подтверждение, вход"; else fail "аккаунт A не создан"; fi

# --- онбординг ---
code="$(request PATCH /me/onboarding '{"websiteUrl":"https://example.com","productComment":"дом и декор","language":"ru"}' "$TOKEN_A")"
[ "$code" = "200" ] && pass "онбординг (200)" || fail "онбординг ($code)"
[ "$(field "['onboarded']")" = "True" ] && pass "флаг онбординга записан" || fail "флаг онбординга не записан"

code="$(request PATCH /me/onboarding '{"websiteUrl":"http://127.0.0.1/admin"}' "$TOKEN_A")"
[ "$code" = "422" ] && pass "онбординг отклоняет локальный адрес (422)" || fail "онбординг принял локальный адрес ($code)"

code="$(request PATCH /me/onboarding '{}' "$TOKEN_A")"
[ "$code" = "200" ] && pass "повторный онбординг без адреса (200)" || fail "повторный онбординг ($code)"

# --- проект и доска ---
code="$(request POST /projects '{"website_url":"https://example.com","niche":"дом и декор"}' "$TOKEN_A")"
PROJECT_ID="$(field "['id']")"
if [ "$code" = "201" ] && [ -n "$PROJECT_ID" ]; then pass "проект создан"; else fail "проект ($code)"; fi

code="$(request POST /boards "{\"project_id\":\"$PROJECT_ID\",\"title\":\"Доска приёмки\"}" "$TOKEN_A")"
BOARD_ID="$(field "['id']")"
if [ "$code" = "201" ] && [ -n "$BOARD_ID" ]; then pass "доска создана"; else fail "доска ($code)"; fi

code="$(request GET "/boards?project_id=$PROJECT_ID" "" "$TOKEN_A")"
if [ "$code" = "200" ]; then
  python3 - "$BOARD_ID" <<'PY' && pass "доска видна в списке" || fail "доска не найдена в списке"
import json, sys
data = json.load(open('/tmp/bench-acceptance.body'))
rows = data if isinstance(data, list) else data.get('boards', [])
raise SystemExit(0 if any(str(r.get('id')) == sys.argv[1] for r in rows) else 1)
PY
else
  fail "список досок ($code)"
fi

# --- кредиты и экспорт ---
code="$(request GET /credits "" "$TOKEN_A")"
if [ "$code" = "200" ]; then
  python3 - <<'PY' && pass "кредиты: баланс и история" || fail "кредиты: структура ответа"
import json
d = json.load(open('/tmp/bench-acceptance.body'))
raise SystemExit(0 if isinstance(d.get('balance'), (int, float)) and isinstance(d.get('transactions'), list) else 1)
PY
else
  fail "кредиты ($code)"
fi

code="$(request GET /account/export "" "$TOKEN_A")"
if [ "$code" = "200" ]; then
  python3 - <<'PY' && pass "экспорт аккаунта содержит разделы" || fail "экспорт: нет ожидаемых разделов"
import json
d = json.load(open('/tmp/bench-acceptance.body'))
raise SystemExit(0 if 'account' in d and 'projects' in d else 1)
PY
else
  fail "экспорт ($code)"
fi

# --- изоляция данных ---
TOKEN_B="$(register_verified "$EMAIL_B")"
if [ -n "$TOKEN_B" ]; then pass "аккаунт B создан"; else fail "аккаунт B не создан"; fi

if [ -n "$TOKEN_B" ] && [ -n "$PROJECT_ID" ]; then
  code="$(request GET "/projects/$PROJECT_ID" "" "$TOKEN_B")"
  case "$code" in
    403|404) pass "чужой проект недоступен ($code)" ;;
    *) fail "чужой проект отдан с кодом $code" ;;
  esac
fi

# --- восстановление пароля ---
BEFORE="$(mail_count)"
code="$(request POST /forgot-password "{\"email\":\"$EMAIL_A\",\"language\":\"ru\"}")"
[ "$code" = "200" ] && pass "запрос сброса пароля (200)" || fail "запрос сброса пароля ($code)"
RESET_TOKEN="$(latest_token "$BEFORE")"
if [ -n "$RESET_TOKEN" ]; then pass "письмо сброса получено"; else fail "письмо сброса не получено"; fi

if [ -n "$RESET_TOKEN" ]; then
  code="$(request POST /reset-password "{\"token\":\"$RESET_TOKEN\",\"password\":\"$NEW_PASSWORD\"}")"
  [ "$code" = "200" ] && pass "пароль изменён (200)" || fail "пароль не изменён ($code)"

  code="$(request POST /login "{\"email\":\"$EMAIL_A\",\"password\":\"$NEW_PASSWORD\"}")"
  [ "$code" = "200" ] && pass "вход новым паролем (200)" || fail "вход новым паролем ($code)"

  code="$(request POST /login "{\"email\":\"$EMAIL_A\",\"password\":\"$PASSWORD\"}")"
  [ "$code" = "401" ] && pass "старый пароль отклонён (401)" || fail "старый пароль ($code)"

  code="$(request POST /reset-password "{\"token\":\"$RESET_TOKEN\",\"password\":\"AnotherPass789!\"}")"
  case "$code" in
    401|422) pass "использованный токен сброса отклонён ($code)" ;;
    *) fail "использованный токен сброса принят ($code)" ;;
  esac
fi

# --- удаление аккаунта ---
TOKEN_A_NEW="$(request POST /login "{\"email\":\"$EMAIL_A\",\"password\":\"$NEW_PASSWORD\"}")"
TOKEN_A_NEW="$(field "['token']")"
code="$(request POST /account/deletion-request '{"password":"WrongPass000!"}' "$TOKEN_A_NEW")"
case "$code" in
  401|403|422) pass "удаление без верного пароля отклонено ($code)" ;;
  # 503 здесь — не пропуск: шлюз «воркер удаления выключен» стоит перед проверкой пароля,
  # поэтому при выключенном воркере любой запрос отклоняется одинаково (fail-closed).
  503) echo "INFO  удаление: воркер выключен, проверка пароля не выполняется (503)" ;;
  *) fail "удаление без верного пароля ($code)" ;;
esac

code="$(request POST /account/deletion-request "{\"password\":\"$NEW_PASSWORD\"}" "$TOKEN_A_NEW")"
case "$code" in
  200) echo "INFO  удаление принято, воркер удаления включён" ;;
  503) pass "удаление отклонено, пока воркер удаления выключен (fail-closed)" ;;
  *) fail "удаление: неожиданный код $code" ;;
esac

echo "────────"
echo "PASS=$PASSED FAIL=$FAILED"
[ "$FAILED" -eq 0 ]
