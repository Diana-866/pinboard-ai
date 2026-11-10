# Background queue operations — AUD-376

## Pinterest schedules
1. Confirm the deployed backend commit and applied migrations include the worker's complete SQL contract through migration 123.
2. Configure one scheduler only: dedicated `npm run worker` process OR external cron calling the protected endpoint. Never expose the scheduler secret in URLs/logs/frontend.
3. Check `GET /admin/operations/pinterest-scheduler` together with due `scheduled`, stale `publishing` and `unknown` rows.
4. For `unknown`, inspect Pinterest and the publish-attempt journal before any manual recovery. Never blindly requeue.
5. If the worker stops during publication, allow fenced recovery/reconciliation to run; do not duplicate the external request manually.

## Transactional email
1. Monitor pending, due-pending, sending, stale-sending and dead counts using the admin email outbox diagnostics.
2. A sleeping API host delays dispatch but does not itself erase queued rows.
3. SMTP accepted + DB acknowledgement lost can produce a duplicate. The stable Message-ID is for correlation, not a delivery guarantee.
4. Retry only through the claim-token RPC path. Do not edit status/claim_token manually without a reviewed recovery procedure.
5. If prompt delivery is a product requirement, design a dedicated always-on dispatcher and budget it separately.

## Image retention
1. Monitor `blocked` queue rows.
2. For an expired lease, first determine whether the prior Storage DELETE completed.
3. Only finalize/retry after confirming the exact object state and matching queue identity. Never issue an unconditional delete or recreate a claim while an old remote operation may still complete.

## Manual review
Manual-review items require a human decision and must never be sent to the Pinterest publisher automatically.
