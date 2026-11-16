# Backend audit — batch 04: GPTunnel AI and Pinterest admin recovery

**Дата:** 2026-11-16  
**Проверенная база:** `main`, HEAD `2e286d7faf2a4a58f27f3ddc530972c926b5d06c`  
**Объём:** 7 backend-модулей, 6 тематических test files, 5 SQL migrations. Статический просмотр; runtime не выполнялся из-за CI runner failure.

## Проверенные модули

- `backend/gptunnel.js` — текстовая генерация, image quote, image task submission/polling, provider task errors, usage metadata.
- `backend/analyze.js` — загрузка сайта для анализа; использует `assertPublicUrl`, pinned DNS lookup, proxy off, no redirects, body/time limits.
- `backend/keywordIdeas.js` — bounded keyword schema, deduplication, no invented volume/trend metrics.
- `backend/promptContext.js` — JSON serialization контекста перед передачей модели.
- `backend/textOutputValidation.js` — строгая схема/лимиты анализа, досок и идей пинов.
- `backend/adminPinterestInventory.js` — bounded read-only очередь публикаций, sanitized errors, no claim/retry side effects.
- `backend/adminPinterestReconciliation.js` — positive-only manual reconciliation после внешнего подтверждения публикации; узкий RPC и timestamp confirmation.

## Проверенные call sites и API routes

- `/projects/:id/analyze` проверяет ownership проекта до сетевого анализа; сохранение также ограничено project id + user_id.
- `/projects/:id/boards/generate` проверяет ownership и tariff entitlement до вызова модели.
- `/projects/:id/keywords` использует bounded prompt/result contract.
- Основной pin generation path в `backend/pins.js` использует `generateTextWithUsage`, durable text usage/plan callbacks, provider task journal, exact quotes, persisted provider task IDs и recovery через polling без повторного создания задачи.
- `/admin/pinterest/schedules` и `/admin/pinterest/reconcile-unknown-publication` защищены `adminActionLimiter`, `requireAuth`, `requireAdmin`; DB RPC повторно проверяет admin privilege.

## Проверенные тесты

- `admin-pinterest-inventory.test.js`
- `admin-pinterest-inventory.integration.sql`
- `admin-pinterest-reconciliation.test.js`
- `gptunnel-payload.test.js`
- `gptunnel-pricing.test.js`
- `gptunnel-recovery.test.js`
- `keyword-ideas.test.js`
- `text-output-validation.test.js`

## Проверенные SQL migrations

- `069_gptunnel_text_usage_ledger.sql`
- `079_gptunnel_provider_cost_reporting_view.sql`
- `082_pinterest_operator_publication_reconciliation.sql`
- `084_admin_pinterest_inventory_latest_attempt.sql`
- `085_admin_pinterest_inventory_account_identity.sql`
- `097_admin_pinterest_inventory_creative_context.sql`

Проверено статически: usage view сохраняет NULL для неизвестных расходов/возвратов, не подменяя их нулём; доступ view ограничен service_role. Admin inventory ограничен пагинацией, выбирает последнюю попытку через lateral LIMIT 1, отдаёт allowlisted account identity/creative context, не раскрывает токены, snapshot URLs и claim token. Reconciliation доступна только для stale unknown schedule без активного claim и только при точном remote pin/board identity; операция positive-only, не делает retry и фиксирует evidence/action audit.

## Замечания / зоны дальнейшей проверки

1. `generateText` legacy wrapper допускает отсутствие usage metadata (`requireUsage:false`). В просмотренных call sites analyze/keyword/board generation используют этот wrapper, тогда как основной billable pin text plan использует `generateTextWithUsage` и отдельный ledger. Из кода не установлено, должны ли анализ/ключевые слова/идеи досок тарифицироваться отдельно; это продуктовая/финансовая политика, которую нужно сверить с UI pricing и кредитным планом до запуска. Не считать это доказанным финансовым дефектом без утверждённой модели тарификации.
2. `providerRequestConfig` передаёт GPTunnel API key в Authorization header, но локальная проверка отсутствия ключа остаётся warning при старте; реальная env и внешний API не проверялись.
3. Не проверены все вызывающие места `rehostImage`/SSRF guard, все AI routes и все миграции GPTunnel ledger на тестовой PostgreSQL.

## Проверки исполнения

- GitHub Actions checkout regression workflow run #10 attempt 2 завершился failure до шагов; Node tests не запускались.
- Vercel на проверенном main имеет build-rate-limit failure.
- В этой сессии не запускались Node tests, provider API calls, PostgreSQL integration tests или production AI generation.
- Production env, GPTunnel balance, real provider pricing and Pinterest admin actions не затрагивались.

## Следующий шаг

Продолжить backend file-by-file аудит оставшихся модулей: Pinterest OAuth/token lifecycle, scheduler/worker, storage/image lifecycle, projects/boards/pins/resource ownership и полный `backend/index.js`. Параллельно отдельно снять CI runner blocker; не помечать тесты пройденными до реального запуска.
