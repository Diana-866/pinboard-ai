# Backend PinPosy — образ для Docker/Amvera.
#
# Один образ обслуживает три роли (web, воркер расписания, воркер удаления аккаунтов):
# код и зависимости одни и те же, роль задаётся командой запуска и APP_ROLE.
#
#   docker build -t pinposy-backend .
#   docker run --env-file .env -p 3000:3000 pinposy-backend
#   docker run --env-file .env -e APP_ROLE=worker pinposy-backend node scheduleWorker.js
#   docker run --env-file .env -e APP_ROLE=worker pinposy-backend node accountDeletionWorker.js
#
# Воркеров запускать именно `node <файл>.js`, а не `npm run worker`: npm — лишний
# процесс-прослойка, который не всегда доносит SIGTERM до Node. Обработчики SIGTERM
# в коде уже есть (index.js, scheduleWorker.js, accountDeletionWorker.js), поэтому
# остановка контейнера завершает текущую задачу, а не рвёт её по таймауту.
#
# BuildKit не требуется: используются только базовые инструкции.
FROM node:22.20.0-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Только production-зависимости: тесты и dev-инструменты в образ не попадают.
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22.20.0-bookworm-slim
# PORT: платформа может не передавать его (в Amvera порт задаётся в конфиге),
# поэтому дефолт задан в образе, а код читает только process.env.PORT.
# APP_ROLE=worker отключает HTTP-проверку живости у воркеров: у них нет HTTP-сервера.
ENV NODE_ENV=production \
    PORT=3000 \
    APP_ROLE=web
WORKDIR /app

# node_modules переносим готовыми: в финальном слое нет npm-кэша и компиляторов.
COPY --from=deps /app/node_modules ./node_modules
# .dockerignore обязателен: без него сюда попадут .env, .git, node_modules хоста
# и каталог backups с дампами базы.
COPY . .

# Процесс не работает от root: приложение не должно иметь прав менять собственный код.
# Коду не нужна запись на диск (загрузки идут в память и в Supabase Storage, логи — в stdout).
USER node

EXPOSE 3000

# Живость процесса, а не готовность базы: /health отвечает без обращения к БД.
# Готовность проверяет /ready и внешний мониторинг. У воркеров HTTP нет — для них
# проверка выходит с кодом 0, иначе compose держит их вечно unhealthy.
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD ["sh", "-c", "if [ \"$APP_ROLE\" != \"web\" ]; then exit 0; fi; node -e \"fetch('http://127.0.0.1:'+process.env.PORT+'/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))\""]

CMD ["node", "index.js"]
