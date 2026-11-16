# Backend audit — batch 05: Pinterest OAuth and account lifecycle

**Дата:** 2026-11-16  
**Проверенная база:** `main`, HEAD `a7be95bdcee56b3a638804566a8f39aac0645869`  
**Объём:** основной `pinterest.js` OAuth/account flow, 5 account helper modules, 8 related unit/integration test files, 7 SQL migrations. Статическая проверка.

## Проверенные backend-модули

- `backend/pinterest.js` — OAuth authorization-code flow, account lookup, token refresh, Pinterest API calls, board verification/pagination, disconnect and route handlers.
- `backend/pinterestAccountRecord.js` — lazy encryption-key rotation using optimistic row-version fence; uncertain refresh rows are not rewritten.
- `backend/pinterestAccountRequest.js` — account-scoped 401 refresh, bounded 429 Retry-After handling; non-idempotent publish can disable replay.
- `backend/pinterestBoardsPagination.js` — cursor pagination, repeated cursor detection and hard page bound.
- `backend/pinterestPublicAccount.js` — public allowlist projection; tokens and user IDs are not returned.
- `backend/pinterestOAuthBrowserBinding.js` — random browser proof, SHA-256 binding, constant-time comparison, Secure/HttpOnly/SameSite=Lax host cookie.
- Previously reviewed helper contracts rechecked where directly called: `pinterestOAuth.js`, `pinterestTokenCrypto.js`, `pinterestRefreshRecovery.js`.

## Проверенные OAuth / account routes

- `POST /integrations/pinterest/link` — authenticated, creates a single-use attempt with DB generation and current token_version; only hash enters signed state, browser secret is returned separately.
- `POST /integrations/pinterest/start` — verifies state + browser proof before setting host cookie and redirecting to Pinterest.
- `GET /integrations/pinterest/callback` — verifies signed state, matching browser cookie, current user token_version, provider identity, tariff and transactional OAuth attempt before storing encrypted credentials.
- `POST /integrations/pinterest/disconnect` — authenticated, account-scoped RPC; tokens are cleared and account soft-disconnected.
- `GET /integrations/pinterest/boards` — authenticated, account-scoped token handling, bounded complete pagination.
- Scheduler worker route is separately protected by a >=32-byte secret and constant-time comparison.

## Проверенные тесты

- `pinterest-account-record.test.js`
- `pinterest-account-request.test.js`
- `pinterest-boards-pagination.test.js`
- `pinterest-oauth-browser-binding.test.js`
- `pinterest-public-account.test.js`
- `pinterest-oauth.test.js`
- `pinterest-oauth-concurrency.sh`
- `pinterest-oauth.integration.sql`
- `pinterest-multi-account-oauth.integration.sql`
- `pinterest-refresh-disconnect-fencing.integration.sql`

## Проверенные SQL migrations

- `026_pinterest_refresh_token_lease.sql` (legacy user-scoped lease; later account-scoped implementation supersedes it)
- `028_pinterest_oauth_attempt_fencing.sql`
- `031_pinterest_account_scoped_foundation.sql`
- `032_pinterest_multi_account_oauth.sql`
- `036_pinterest_refresh_uncertainty_fence.sql`
- `062_pinterest_refresh_fence_requires_rotated_refresh_token.sql`
- `080_pinterest_oauth_effective_entitlement_precedence.sql`

Проверено: OAuth attempt is single-use and generation-fenced; callback checks token_version; DB computes effective plan/account cap under lock; account identity is stable per PinPosy user; token refresh lease is per Pinterest account; uncertain fence is persisted before outbound rotating refresh; only a complete rotated access+refresh pair can clear it; disconnect fences stale refresh workers; only explicit provider 429 releases the exact pre-request uncertainty fence; token ciphertext migration uses compare-and-swap; service-role-only RPC/table access.

## Подтверждённые дефекты

В просмотренных OAuth/account helper modules не найдено подтверждённого критического обхода авторизации, утечки токенов в публичной проекции или возможности повторно использовать uncertain refresh token. Это вывод только по указанному пакету, не заключение о всём Pinterest worker/publish path.

## Открытые вопросы

1. `isPinterestReauthRequired` не считает отсутствующий `expires_at` самостоятельной причиной reauth; при отсутствии refresh token реальное состояние выяснится только при запросе к Pinterest. Тест закрепляет такое поведение. Нужно решить UX-политику для legacy rows после проверки фактической структуры production данных.
2. Реальный OAuth redirect/cookie поведение зависит от доменов и browser privacy settings; в этой сессии staging OAuth не запускался.
3. Проверка migration chain и всех account-scoped RPC privileges на disposable PostgreSQL всё ещё требуется.

## Проверки исполнения

GitHub Actions runner blocker из пакета 03 остаётся: regression workflow run #10 attempt 2 завершился до шагов; эти tests и SQL scripts здесь не запускались. Production Pinterest app, credentials, database и аккаунты не менялись.

## Следующий шаг

Продолжить scheduler/worker, publication lifecycle, Storage/image lifecycle, projects/boards/pins ownership и полный `backend/index.js`; после восстановления runner выполнить весь backend unit/integration suite и migration chain на disposable PostgreSQL.
