"use strict";

/**
 * Section 115. A generation that fails before the first billable image request gives the customer
 * their credits back - the database releases the reservation the moment the request turns `failed`,
 * and even an `unknown` request with no persisted image task releases it (migration 088).
 *
 * The customer never learned that. They read "внутренняя ошибка сервера, попробуйте позже" and had no
 * way to tell a free failure from a charged one, which is the difference between trying again and
 * writing to support about money. The ambiguous case already has a code
 * (`generation_outcome_unknown`, a 409); the safe case had none.
 *
 * The rule is deliberately narrow: this only marks a failure where the provider was never asked to
 * make an image, and it never overwrites a code the failure already carries - a 402 keeps saying
 * "insufficient credits", which is more specific than "nothing was charged".
 */

const GENERATION_NOT_CHARGED = "generation_not_charged";
const GENERATION_OUTCOME_UNKNOWN = "generation_outcome_unknown";

/**
 * Attaches `generation_not_charged` to a failure that provably spent nothing.
 *
 * @param {unknown} error the thrown value, returned unchanged when it cannot carry details
 * @param {{ providerStarted?: boolean }} state whether any billable provider request was made
 */
function markGenerationFailure(error, state = {}) {
  if (!error || typeof error !== "object") return error;
  const details = error.details && typeof error.details === "object" ? error.details : null;
  if (details && typeof details.code === "string" && details.code.trim()) return error;
  // Once the provider was asked, this request is fenced as `unknown`: the outcome is unconfirmed and
  // the credit reservation is deliberately kept until it is reconciled. Saying "nothing was charged"
  // there would be a lie the customer would act on, so the honest statement is the fenced one.
  const code = state.providerStarted ? GENERATION_OUTCOME_UNKNOWN : GENERATION_NOT_CHARGED;
  error.details = { ...(details || {}), code };
  return error;
}

module.exports = { GENERATION_NOT_CHARGED, GENERATION_OUTCOME_UNKNOWN, markGenerationFailure };
