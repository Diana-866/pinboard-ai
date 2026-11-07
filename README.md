# PinPosy (pinboard-ai)

AI-сервис планирования и создания контента для Pinterest: анализ сайта, генерация идей досок и пинов, изображения, ручное утверждение и публикация через официальный Pinterest API.

**Сайт:** https://pinposy.com
**Бэкенд:** https://pinboard-ai-backend.onrender.com

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
| `PINTEREST_TOKEN_ENCRYPTION_KEY` | Активный 32-байтовый ключ AES-256-GCM для токенов Pinterest (base64 или 64 hex-символа) |
| `PINTEREST_TOKEN_ENCRYPTION_KEY_PREVIOUS` | Необязательный предыдущий ключ на период безопасной ротации; старые токены будут перешифровываться при чтении аккаунта |

### Ротация ключа Pinterest

При смене `PINTEREST_TOKEN_ENCRYPTION_KEY` сначала установите новый ключ как активный, а старый — в `PINTEREST_TOKEN_ENCRYPTION_KEY_PREVIOUS`. Старые зашифрованные токены останутся читаемыми и будут перешифрованы новым ключом при следующем чтении соответствующего аккаунта. Не удаляйте предыдущий ключ, пока не убедитесь, что все сохранённые Pinterest-аккаунты были перешифрованы; иначе неиспользуемые аккаунты могут потерять доступ.

## Документы

- Политика конфиденциальности: `frontend/src/legal/privacy-policy.ru.md` / `.en.md` (отображается на `/privacy`)
- Условия использования: `frontend/src/legal/terms.ru.md` / `.en.md` (отображается на `/terms`)
- Заявка в Pinterest API: `docs/pinterest/` (описание, обоснование scopes, сценарий демо-видео, чек-лист)

## План разработки

Актуальный план и журнал выполнения — в `planning.md`.
