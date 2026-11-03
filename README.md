# PinPosy (pinboard-ai)

AI-сервис планирования и создания контента для Pinterest: анализ сайта, генерация идей досок и пинов, изображения, ручное утверждение и публикация через официальный Pinterest API.

**Сайт:** https://pinposy.com
**API:** https://api.pinposy.com

## Структура

```
backend/   — Express API (Node.js): аутентификация, проекты, доски, пины, кредиты, админка
frontend/  — React 19 + Vite + TypeScript + Tailwind 4 (SPA)
docs/      — документы для заявки Pinterest API и сопроводительные материалы
```

## Стек

| Слой | Сейчас | Цель (переезд на РФ-инфраструктуру) |
|---|---|---|
| Фронтенд | Vercel | статика на своём сервере/CDN в РФ |
| Бэкенд | Render | VPS/контейнер в РФ (Docker) |
| База данных | Supabase (PostgreSQL) | managed PostgreSQL в РФ |
| AI | GPTunnel (gptunnel.ru) | без изменений |
| Платежи | — (план: Prodamus) | Prodamus |

## Локальная разработка

Бэкенд:
```bash
cd backend
npm install
JWT_SECRET=dev-secret SUPABASE_URL=... SUPABASE_ANON_KEY=... GPTUNNEL_API_KEY=... npm start
```

Фронтенд:
```bash
cd frontend
npm install
npm run dev
```

## Переменные окружения бэкенда

| Переменная | Назначение |
|---|---|
| `JWT_SECRET` | подпись JWT-токенов |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (или `SUPABASE_ANON_KEY`) | доступ к БД |
| `GPTUNNEL_API_KEY` | ключ AI-провайдера |
| `FRONTEND_URL` | CORS: адрес фронтенда |
| `ADMIN_SECRET` | секрет админ-операций |
| `ENABLE_DEV_TOPUP` | `true` — включает тестовое пополнение кредитов (только вне production) |

## Документы

- Политика конфиденциальности: `frontend/src/legal/privacy-policy.ru.md` / `.en.md` (отображается на `/privacy`)
- Условия использования: `frontend/src/legal/terms.ru.md` / `.en.md` (отображается на `/terms`)
- Заявка в Pinterest API: `docs/pinterest/` (описание, обоснование scopes, сценарий демо-видео, чек-лист)

## План разработки

Актуальный план и журнал выполнения — в `planning.md`.
