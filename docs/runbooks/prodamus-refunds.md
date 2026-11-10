# Prodamus refund runbook

Internal operating procedure for PinPosy support. This document describes the current manual process; it does not imply that refund reconciliation is automated in PinPosy.

## Before submitting a refund

1. Find the payment in the Prodamus payment list using the provider order ID.
2. Match the order ID to `subscriptions.provider_payment_id` or `credit_purchases.provider_payment_id` in PinPosy's database.
3. Confirm the payment is marked successful in Prodamus and verify the customer, amount, currency, product, and payment date.
4. Review the customer's request and determine whether the request concerns a full or partial refund.
5. For credit packs, check whether the purchased credits have already been spent. Do not blindly subtract the original credit amount: the customer may have used some or all of it.
6. For subscriptions, check whether a later successful subscription has since extended or replaced the entitlement. Do not revoke a newer paid entitlement because an older payment is being refunded.

## Submit the refund in Prodamus

1. Sign in to the Prodamus payment page and open **Payment list**.
2. Open the payment by its order ID.
3. Choose a full or partial refund and enter the amount. Prodamus documents a minimum refund amount of 100 RUB; partial refunds may require activation for the payment page.
4. Choose the available settlement method in Prodamus:
   - deduction from future incoming payments; or
   - payment order, following the instructions and bank details in the generated document.
5. Submit the refund request.

Prodamus documents the payment statuses:
- **Возвращается** — the refund request has been submitted and is being processed.
- **Возвращён** — Prodamus has completed its part of the refund process and issued the refund receipt.

Check the final status in Prodamus and retain the refund receipt or confirmation with the support case. Prodamus says the customer's bank may take 1–30 business days to credit the funds; the common range is 1–5 business days.

## PinPosy reconciliation — manual only

Current PinPosy code does not consume a refund webhook or automatically reconcile a Prodamus refund. The database does not currently have a `refunded` status or refund ledger for subscriptions and credit purchases.

Until a dedicated, tested refund workflow is implemented:

- Keep the Prodamus order ID, original payment amount/currency, refund amount, refund date, Prodamus refund status, and receipt reference in the support case.
- Do not manually change `subscriptions.status` or `credit_purchases.status` to `refunded`; current database constraints do not allow that status.
- Do not directly reduce a user's credit balance without an approved, auditable adjustment that accounts for credits already consumed.
- Do not change a user's tariff or period end without checking for newer successful payments and preserving any later entitlement.
- If a refund is partial, record the refunded amount separately; the current schema does not track partial refund totals.

## Sources

- Prodamus: [How refunds work](https://help.prodamus.ru/payform/vozvraty-platezhei/kak-v-prodamus-ustroeny-vozvraty-platezhei-klientam)
- Prodamus: [How to submit a refund request](https://help.prodamus.ru/payform/vozvraty-platezhei/sformirovat-zayavku-na-vozvrat)
- Prodamus: [How to verify that a refund is complete](https://help.prodamus.ru/payform/vozvraty-platezhei/kak-ponyat-chto-vozvrat-proizveden)
