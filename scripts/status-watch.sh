#!/usr/bin/env bash
#
# Наблюдение за доступностью PinPosy.
#
#   ./scripts/status-watch.sh --base-url https://backend.example.com --once
#   ./scripts/status-watch.sh --base-url https://backend.example.com --interval 60 \
#     --webhook "$ALERT_WEBHOOK_URL"
#
# Что делает: опрашивает /health (жив ли процесс) и /ready (доступна ли база), сводит их в одно
# состояние и сообщает об ИЗМЕНЕНИИ состояния — а не о каждом опросе. Иначе канал алертов
# превращается в шум и его перестают читать.
#
# Состояния: ok (жив, база доступна), degraded (жив, база недоступна), down (не отвечает).
#
# Вебхук: POST с JSON {"text": "..."} — формат, который принимают Slack, Mattermost и большинство
# дешёвых «incoming webhook» сервисов. Адрес задаётся флагом --webhook или ALERT_WEBHOOK_URL.
# Сам адрес и тело ответа не печатаются: в адресе часто лежит секрет.
#
# Коды выхода: 0 — в режиме --once состояние ok; 1 — состояние не ok; 2 — неверные аргументы.
# В режиме наблюдения процесс работает до остановки и завершается по SIGINT/SIGTERM с кодом 0.
set -uo pipefail

BASE_URL="${PINPOSY_BASE_URL:-}"
INTERVAL=60
ONCE=0
WEBHOOK="${ALERT_WEBHOOK_URL:-}"
STATE_FILE="${TMPDIR:-/tmp}/pinposy-status-watch.state"
TIMEOUT=15

usage() {
  cat <<'USAGE'
Usage: ./scripts/status-watch.sh --base-url <url> [options]

  --base-url <url>    Адрес бэкенда (или PINPOSY_BASE_URL)
  --interval <sec>    Период опроса в режиме наблюдения (по умолчанию 60)
  --once              Один опрос и выход (для cron)
  --webhook <url>     Куда отправлять смену состояния (или ALERT_WEBHOOK_URL)
  --state-file <f>    Файл последнего состояния (по умолчанию во временном каталоге)
  --timeout <sec>     Таймаут одного запроса (по умолчанию 15)
  -h, --help          Эта справка
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --base-url) BASE_URL="${2:-}"; shift 2 ;;
    --interval) INTERVAL="${2:-}"; shift 2 ;;
    --once) ONCE=1; shift ;;
    --webhook) WEBHOOK="${2:-}"; shift 2 ;;
    --state-file) STATE_FILE="${2:-}"; shift 2 ;;
    --timeout) TIMEOUT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

BASE_URL="${BASE_URL%/}"
[ -n "$BASE_URL" ] || { echo "error: нужен --base-url или PINPOSY_BASE_URL" >&2; exit 2; }
case "$INTERVAL" in ''|*[!0-9]*) echo "error: --interval must be a positive integer" >&2; exit 2 ;; esac
command -v curl >/dev/null 2>&1 || { echo "error: curl not found" >&2; exit 2; }

notify() {
  local text="$1"
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$text"
  [ -n "$WEBHOOK" ] || return 0
  # Тело собирается python'ом: кавычки и переводы строк в тексте не должны ломать JSON.
  python3 - "$WEBHOOK" "$text" <<'PY' >/dev/null 2>&1 || printf 'WARN  не удалось отправить уведомление\n'
import json, sys, urllib.request
webhook, text = sys.argv[1], sys.argv[2]
body = json.dumps({"text": text}).encode()
req = urllib.request.Request(webhook, data=body, headers={"content-type": "application/json"})
urllib.request.urlopen(req, timeout=10).read()
PY
}

probe() {
  local health ready
  health="$(curl -s -o /dev/null -m "$TIMEOUT" -w '%{http_code}' "$BASE_URL/health" 2>/dev/null || true)"
  if [ "$health" != "200" ]; then
    printf 'down'
    return
  fi
  ready="$(curl -s -o /dev/null -m "$TIMEOUT" -w '%{http_code}' "$BASE_URL/ready" 2>/dev/null || true)"
  if [ "$ready" = "200" ]; then
    printf 'ok'
  else
    printf 'degraded'
  fi
}

describe() {
  case "$1" in
    ok) printf 'жив, база доступна' ;;
    degraded) printf 'процесс жив, база недоступна — пользователи не смогут войти' ;;
    down) printf 'бэкенд не отвечает или отвечает ошибкой на /health' ;;
  esac
}

LAST="$(cat "$STATE_FILE" 2>/dev/null || true)"

if [ "$ONCE" -eq 1 ]; then
  CURRENT="$(probe)"
  printf 'STATUS %s (%s) %s\n' "$CURRENT" "$BASE_URL" "$(describe "$CURRENT")"
  if [ "$CURRENT" != "$LAST" ]; then
    printf '%s' "$CURRENT" > "$STATE_FILE" 2>/dev/null || true
    notify "PinPosy: $CURRENT — $(describe "$CURRENT") ($BASE_URL)"
  fi
  [ "$CURRENT" = "ok" ]
  exit $?
fi

trap 'echo "остановлено"; exit 0' INT TERM
echo "наблюдение: $BASE_URL, интервал ${INTERVAL}s, состояние: ${LAST:-неизвестно}"
while :; do
  CURRENT="$(probe)"
  if [ "$CURRENT" != "$LAST" ]; then
    printf '%s' "$CURRENT" > "$STATE_FILE" 2>/dev/null || true
    notify "PinPosy: $CURRENT — $(describe "$CURRENT") ($BASE_URL)"
    LAST="$CURRENT"
  fi
  sleep "$INTERVAL"
done
