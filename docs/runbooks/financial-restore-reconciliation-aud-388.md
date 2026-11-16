# PinPosy — финансовая сверка после восстановления (AUD-388)

> Выполнять сначала только на изолированной копии. Не применять автоматические исправления к production.

## 1. Подготовить независимые доказательства

- Зафиксировать backup-set ID, snapshot timestamp, commit SHA и migration revision.
- Получить из Prodamus защищённый экспорт заказов/платежей/возвратов за период от последней подтверждённой сверки до snapshot.
- Найти подписанный opening-balance snapshot кредитов на ту же контрольную дату. Если его нет, ledger нельзя считать полным источником исторического баланса.

## 2. Кредиты

- Для каждой покупки со статусом success проверить `balance_credited_at IS NOT NULL` и ровно одну строку `credit_transactions` с тем же `purchase_id`, `user_id`, `amount=credits`, `type=topup`.
- Найти orphan ledger rows с `purchase_id`, у которых нет покупки, и успешные покупки без matching ledger.
- Сверить `users.credits_balance` с opening balance + суммой ledger движений после контрольной даты.
- Отдельно изучить типы ручных/legacy операций и RPC `adjust_credits_balance`: он меняет баланс без записи в ledger.
- Не исправлять баланс простым UPDATE. Любую корректировку оформлять отдельным согласованным ledger entry после расследования.

## 3. Prodamus и подписки

- Сопоставить `provider_payment_id` с экспортом Prodamus, сверить сумму, валюту, время оплаты и возврата.
- Для успешных credit purchases проверить фактическое зачисление и settlement checkout request.
- Для подписок сверить paid order, `period_start`, `period_end`, тариф и текущий entitlement пользователя.
- Все unknown/ambiguous checkout rows оставить fenced до получения provider evidence; не создавать повторный счёт и не начислять вручную только по отсутствию webhook.
- GPTunnel generation/regeneration provider refunds сопоставить с immutable `provider_refund_reconciliation_audit` и исходной provider transaction. Prodamus customer refunds проверять отдельно по внешнему refund receipt/support case; migrations 072–073 не являются Prodamus refund ledger.

## 4. Протокол

Для каждого расхождения записать: user ID (в закрытом рабочем документе), local row IDs, provider order ID, сумма/валюта, backup-set ID, evidence link, решение, согласовавшего оператора и timestamp. В общий репозиторий персональные финансовые данные не добавлять.

Restore drill успешен только после сверки всех расхождений или их явной блокировки для ручного решения. Не включать платежи, webhook side effects, email dispatch и генерацию до завершения сверки.

## Текущие ограничения

Opening balance ledger не подтверждён; автоматического financial reconciliation job/report не найдено; legacy service_role RPC может менять баланс без ledger. Провайдерские экспорты и production данные не проверялись.