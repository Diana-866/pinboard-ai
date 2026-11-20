"use strict";

/**
 * Await a Supabase query builder and handle its failure without relying on `.catch`.
 *
 * A builder from supabase-js is a *thenable*: it has `then` but no `catch` (checked against
 * @supabase/postgrest-js 2.116.0, whose PostgrestBuilder only defines `then`). Calling
 * `supabase.rpc(...).catch(...)` therefore throws `TypeError: ....catch is not a function` at exactly the
 * moment the code is trying to record a failure - inside a request's own catch block. That throw escapes
 * the handler, becomes an unhandled rejection, and the fatal handlers installed in index.js turn it into
 * `process.exit(1)`: a single failed regeneration, or a Pinterest publication whose local commit failed,
 * would take the whole backend down instead of journalling the problem.
 *
 * Awaiting the thenable inside try/catch keeps the failure recoverable without ever calling `.catch`
 * on a builder.
 */
async function settleQuery(query, onError) {
  try {
    // `await` unwraps the thenable; the point is that this module never calls `.catch` on it.
    return await query;
  } catch (error) {
    if (typeof onError !== "function") throw error;
    await onError(error);
    return null;
  }
}

module.exports = { settleQuery };
