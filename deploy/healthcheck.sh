#!/usr/bin/env bash
# Внешняя проверка живости сервиса для cron/монитора.
#
#   ./deploy/healthcheck.sh --url https://pinposy.com/health
#   ./deploy/healthcheck.sh --url ... --retries 3 --timeout 5
#
# Коды возврата: 0 — сервис отвечает как ожидается, 1 — не отвечает или отвечает неверно,
# 2 — вызов без адреса (монитор с пустым адресом не должен рапортовать успех).
# Печатается одна строка: адрес, код HTTP и что именно не сошлось.
set -euo pipefail

url=""
retries=2
timeout=5
fail_body=""

usage() {
  echo "usage: healthcheck.sh --url URL [--retries N] [--timeout SECONDS]" >&2
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --url)
      [ $# -ge 2 ] || usage
      url="$2"; shift 2 ;;
    --retries)
      [ $# -ge 2 ] || usage
      retries="$2"; shift 2 ;;
    --timeout)
      [ $# -ge 2 ] || usage
      timeout="$2"; shift 2 ;;
    *)
      usage ;;
  esac
done

[ -n "$url" ] || usage
case "$retries" in ''|*[!0-9]*) usage ;; esac
case "$timeout" in ''|*[!0-9]*) usage ;; esac

attempt=1
while [ "$attempt" -le "$retries" ]; do
  # -s тихо, -S показать ошибку, -o тело во временный файл, -w код ответа.
  body="$(mktemp)"
  code="$(
    curl -sS --max-time "$timeout" -o "$body" -w '%{http_code}' "$url" 2>/dev/null || echo "000"
  )"

  if [ "$code" != "200" ]; then
    echo "healthcheck: FAIL $url returned ${code} (attempt $attempt/$retries)"
    rm -f "$body"
    attempt=$((attempt + 1))
    [ "$attempt" -le "$retries" ] && sleep 1
    continue
  fi

  # Тело обязано подтвердить готовность: 200 от прокси или страницы-заглушки ещё не сервис.
  if ! grep -q '"ok"[[:space:]]*:[[:space:]]*true' "$body"; then
    fail_body="$(tr -d '\n' < "$body" | cut -c1-120)"
    echo "healthcheck: FAIL $url returned 200 without ok:true ($fail_body)"
    rm -f "$body"
    attempt=$((attempt + 1))
    [ "$attempt" -le "$retries" ] && sleep 1
    continue
  fi

  rm -f "$body"
  echo "healthcheck: OK $url"
  exit 0
done

exit 1
