# Backend audit — batch 06: Pinterest scheduler and worker

**Дата:** 2026-11-16  
**Проверенная база:** `main`, HEAD `92152e3277dd2fd41e053498752955f8b6ac9c5a`  
**Объём:** scheduler policy, health, cron/worker modules, full internal worker route, 6+ unit/integration contracts and scheduler SQL migrations. Статическая проверка.

## Проверенные backend-модули

- `backend/pinterestSchedule.js` — safe retry policy, publication ledger matching, schedule snapshot, destination URL normalization, claim identity, heartbeat.
- `backend/pinterestSchedulerHealth.js` — stale/running/failed health projection with allowlisted fields.
- `backend/scheduleWorker.js` — dedicated polling worker, one claim/request, timeout below stale-claim lease, bounded backoff, overlap guard, bounded shutdown drain, secret-safe logs.
- `backend/scheduleCron.js` — one-shot authenticated runner, no redirects, non-pooled HTTP agents, bounded request timeout, response contract validation.
- `backend/scheduleResponse.js` — strict one-item response/counter identity validation.
- Full `/internal/pinterest/schedule/run` route in `backend/pinterest.js` — secret authentication, scheduler monitor, reconciliation before claims, single-item claim, claim heartbeat, entitlement gate, publish journal, remote-ID recovery, exact ledger confirmation, conditional schedule transition.
- `GET /admin/pinterest/scheduler-health` route and access guard reviewed in `backend/index.js`.

## Проверенные тесты

- `schedule-worker.test.js`
- `schedule-cron.test.js`
- `schedule-response.test.js`
- `pinterest-scheduler-health.test.js`
- `pinterest-scheduler-route-contract.test.js`
- `pinterest-schedule-claim-heartbeat.integration.sql`
- `pinterest-schedule-claim-concurrency.sh`
- `pinterest-scheduler-completion-fencing.integration.sql`

## Проверенные SQL migrations

- `113_persistent_manual_review_queue.sql`
- `114_pinterest_schedule_claim_heartbeat.sql`
- `122_pinterest_scheduler_health_monitor.sql`
- `123_pinterest_scheduler_completion_fencing.sql`
- Дополнительно проверен recovery contract из `125_pinterest_recover_known_remote_publication_ids.sql` и `126_pinterest_reconcile_only_schedulable_known_remote_ids.sql` через route-contract tests.

Проверено: claim ограничен одним schedule на запрос; heartbeat обновляет только publishing row с точным fencing token; старый token не может renew; stale recovery не должна путать pre-POST claims с уже начавшимся provider publish; completion monitor привязан к run UUID и terminal success не может быть переписан поздним failure; known remote IDs восстанавливаются без повторного Pinterest POST и подтверждаются точным publication ledger.

## Подтверждённые дефекты

В просмотренном scheduler/worker пакете подтверждённый критический дефект не найден. Это не означает, что scheduler production-ready: runtime/DB race tests не исполнялись в этой сессии, а фактическое расписание внешнего cron/worker и production secrets не проверялись.

## Ограничения и блокеры

- GitHub Actions regression workflow run #10 attempt 2 завершился до шагов; backend Node/PostgreSQL tests остаются НЕ подтверждёнными.
- Не проверены production cron schedule, Render worker service, scheduler secret, Supabase migrations state и фактическая scheduler monitor row.
- Не отправлялись реальные Pinterest публикации.

## Следующий шаг

Продолжить Storage/image lifecycle и project/board/pin ownership modules; затем завершить полный route map `backend/index.js`, исправить найденные defects и восстановить исполняемый CI runner для полного unit/integration + migration chain.
