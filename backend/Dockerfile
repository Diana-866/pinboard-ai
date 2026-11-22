# Backend PinPosy — образ для Docker/Amvera.
#
# Один образ обслуживает три роли (web, воркер расписания, воркер удаления аккаунтов):
# роль выбирается командой запуска, код и зависимости одни и те же.
#
#   docker build -t pinposy-backend .
#   docker run --env-file .env -p 3000:3000 pinposy-backend
#   docker run --env-file .env pinposy-backend npm run worker
#   docker run --env-file .env pinposy-backend npm run worker:account-deletion

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Только production-зависимости: тесты и dev-инструменты в образ не попадают.
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app

# node_modules переносим готовыми: в финальном слое нет npm-кэша и компиляторов.
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Процесс не работает от root: приложение не должно иметь прав менять собственный код.
USER node

EXPOSE 3000

# Проверка живости процесса, а не базы: /health отвечает без обращения к БД.
# Готовность базы проверяет /ready и внешний мониторинг.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]
