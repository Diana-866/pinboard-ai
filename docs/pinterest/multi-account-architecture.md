# Pinterest multi-account support — current implementation status

**Актуальность:** 2026-11-16. Этот документ обновлён после переноса реализации в текущую release line main. Старые формулировки «feature branch only», «calendar selector still missing» и «no migration applied to production» относились к более раннему снимку и не должны использоваться как описание текущего Git state или production database.

## Текущий код в main

- Миграции 031–033 реализуют account-scoped Pinterest foundation, OAuth и publication/schedule identity.
- OAuth callback сохраняет verified external Pinterest identity; reconnect адресует соответствующую запись, refresh token координируется per-account lease/CAS.
- Account status/settings UI читает список реальных подключений и позволяет выбирать аккаунт; credentials остаются на backend.
- Manual publish и schedule contracts используют точный account ID; backend не должен угадывать аккаунт, если подключено несколько.
- Calendar UI в frontend/src/components/calendar/PublishingCalendar.tsx содержит выбор/фильтр аккаунта для отображения расписания и выбор account ID при reconciliation legacy schedule. Локальные cadence/presentation settings календаря не являются источником подтверждённой OAuth identity.
- Backend/frontend implementation и миграции присутствуют в main; старую ветку feat/persisted-boards-api не использовать как источник текущего состояния.

## Ключевые гарантии, которые должны сохраняться

1. Стабильный PinPosy account ID (pinterest_accounts.id) является внутренней идентичностью; внешний Pinterest ID подтверждается через OAuth profile.
2. Один пользователь может иметь несколько подключений в пределах server-enforced plan cap. Reconnect существующей внешней identity не должен занимать новый слот.
3. Refresh, disconnect, board lookup, manual publication и scheduled publication должны быть account-scoped; токены не выдаются frontend.
4. Publication attempt, publication и active schedule имеют account-scoped identity. Worker использует account ID из конкретной schedule row и не выбирает «первый» аккаунт.
5. Legacy rows без доказуемого Pinterest account mapping не должны автоматически переназначаться или повторно публиковаться.
6. Disconnect не должен затрагивать другие Pinterest accounts пользователя; in-flight/unknown outcomes остаются fenced до reconciliation.

## Migration sequence

- 031 — account-scoped foundation, stable identity, soft disconnect and refresh leases.
- 032 — multi-account OAuth identity/upsert and transactional plan cap.
- 033 — account-scoped publication/schedule identity and worker contracts.

Эти миграции входят в активную цепочку main 010–148. Их наличие в Git **не доказывает**, что они применены к production Supabase. Проверяй фактический production migration state отдельно; не применяй миграции к production без backup, disposable/staging replay, согласованного backend/frontend rollout и явного разрешения владельца.

## Проверки и ограничения

- SQL integration coverage для Pinterest OAuth/account/publication/scheduling перечислена в docs/backend-audit/14-sql-integration-test-inventory.md.
- Статические проверки и контракты не заменяют фактический SQL integration runner, backend tests, frontend tests/build и live Pinterest OAuth/publication smoke.
- На дату обновления обязательный SQL integration gate UA-004 остаётся открытым; поэтому эту функциональность нельзя объявлять полностью production-verified.
- Подробные исторические проектные решения можно восстановить из Git history; текущий исполняемый контракт определяется кодом main, миграциями 031–033 и соответствующими backend/frontend tests.
