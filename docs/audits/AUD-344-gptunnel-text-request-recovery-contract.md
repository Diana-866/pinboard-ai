# AUD-344 — GPTunnel text request ambiguity and provider recovery capabilities

**Date:** 2026-11-10  
**Status:** DOCUMENTATION / SOURCE REVIEW — no runtime changes

## Source behavior

- `backend/gptunnel.js` sends synchronous `POST https://gptunnel.ru/v1/chat/completions` with model/messages and a 30-second Axios timeout.
- The request currently has no provider idempotency header/key or documented request replay token.
- On a successful response, the code extracts `response.data.id` as `requestId` and persists it in the usage ledger, but only after the complete response has arrived.
- No text-completion status lookup/retrieval method is implemented in this repository.
- Image-task idempotency is separate: CreativeLab task creation accepts `idempotency_key`; this must not be assumed to apply to chat completions.

## Provider documentation review

The current GPTunneL chat-completions documentation describes a synchronous POST request and a response containing an `id` plus usage/cost. Its listed ChatGPT API endpoints include models, chat completions, assistant chat, and messages; it does not document a chat-completion idempotency key or a lookup-by-completion-ID endpoint. The provider's CreativeLab task docs separately document `idempotency_key` for asynchronous tasks.

## Conclusion

A timeout or process crash after GPTunnel accepted a text request but before the full response reached PinPosy is an ambiguous paid operation. The response ID is unavailable in this failure window, and the public API documentation reviewed here does not provide a supported way to replay or retrieve that completion safely.

The current PinPosy behavior—mark request outcome uncertain before submission, persist no fabricated zero cost, and prohibit automatic same-key text resubmission when no durable plan exists—is the safe behavior under the documented contract.

## Recommendation

- Do not add an automatic text retry or send an assumed idempotency header.
- Keep request state `unknown` for ambiguous outcomes without a durable plan.
- If GPTunneL later documents chat idempotency or completion retrieval, add a separate provider adapter capability and tests before enabling recovery.
- Consider surfacing a clear user-facing "generation outcome requires support/reconciliation" message and admin reconciliation record for these rare cases.

## Validation

- Reviewed `backend/gptunnel.js`, `backend/pins.js`, and the generation route.
- Compared behavior with current GPTunneL API documentation.
- No code, schema, production data, provider calls, payments, merge, or deployment changed.
- Runtime tests/build/CI were not run.
