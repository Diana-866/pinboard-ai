const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyScheduleFailure,
  canRetryScheduleFailure,
  getScheduleRetryDelayMinutes,
  buildScheduleWorkerFailureState,
  hasMatchingScheduleAttemptIdentity,
  hasCompleteScheduleClaimIdentity,
  isScheduleClaimUpdateConfirmed,
  resolvePublishedReservation,
  persistPublishFailureJournal,
  isPinterestPublishOutcomeUnknown,
  buildPinScheduleSnapshot,
  resolvePinScheduleSnapshot,
  classifyLegacyScheduleAccount,
  getScheduleRetryability,
  getScheduleFailureReason,
  sanitizeScheduleForClient,
} = require("../pinterestSchedule");

test("a disconnected Pinterest account before publication is a terminal failure", () => {
  assert.equal(classifyScheduleFailure(null, null), "failed");
});

test("an unreadable publish journal is unknown and must not be retried", () => {
  assert.equal(classifyScheduleFailure(null, new Error("database unavailable")), "unknown");
  assert.equal(canRetryScheduleFailure(null, new Error("database unavailable"), new Error("503")), false);
});

test("a confirmed remote publication wins over a later worker error", () => {
  assert.equal(classifyScheduleFailure({
    status: "published",
    pinterest_pin_id: "remote-pin-123",
  }, null), "published");
});

test("an ambiguous or still-processing publish attempt remains non-retryable", () => {
  assert.equal(classifyScheduleFailure({ status: "unknown" }, null), "unknown");
  assert.equal(classifyScheduleFailure({ status: "processing" }, null), "unknown");
  assert.equal(canRetryScheduleFailure({ status: "unknown" }, null, Object.assign(new Error("503"), { httpStatus: 503 })), false);
});

test("a failed journal retries only when the database marks it safe", () => {
  assert.equal(classifyScheduleFailure({ status: "failed", retry_safe: false }, null), "failed");
  assert.equal(canRetryScheduleFailure({ status: "failed", retry_safe: false }, null, Object.assign(new Error("503"), { httpStatus: 503 })), false);
  assert.equal(canRetryScheduleFailure({ status: "failed", retry_safe: true }, null, Object.assign(new Error("403"), { httpStatus: 403 })), true);
  assert.equal(canRetryScheduleFailure({ status: "unknown", retry_safe: true }, null, Object.assign(new Error("503"), { httpStatus: 503 })), false);
  assert.equal(canRetryScheduleFailure({ status: "processing", retry_safe: true }, null, Object.assign(new Error("503"), { httpStatus: 503 })), false);
});

test("an expired subscription is terminal even when an older publish attempt was retry-safe", () => {
  const state = buildScheduleWorkerFailureState({
    attempt: { status: "failed", retry_safe: true },
    error: Object.assign(new Error("Active subscription required"), {
      httpStatus: 403,
      retryable: false,
    }),
    attempts: 1,
    now: 1_000,
  });

  assert.equal(state.finalStatus, "failed");
  assert.equal(state.retryable, false);
  assert.equal(state.shouldRetry, false);
  assert.equal(state.nextStatus, "failed");
  assert.equal(state.retryAt, null);
});
test("a terminal Pinterest board preflight rejection overrides an older retry-safe journal", () => {
  const previousSafeAttempt = { status: "failed", retry_safe: true };
  const deletedBoardError = Object.assign(new Error("Selected Pinterest board is unavailable"), {
    httpStatus: 422,
    retryable: false,
  });

  assert.equal(canRetryScheduleFailure(previousSafeAttempt, null, deletedBoardError), false);
});

test("transient pre-publication failures can retry when no publish attempt exists", () => {
  assert.equal(canRetryScheduleFailure(null, null, Object.assign(new Error("temporary upstream failure"), { httpStatus: 502 })), true);
  assert.equal(canRetryScheduleFailure(null, null, Object.assign(new Error("temporary service failure"), { httpStatus: 503 })), true);
  assert.equal(canRetryScheduleFailure(null, null, new Error("temporary database error")), true);
});

test("client errors before publication are terminal", () => {
  assert.equal(canRetryScheduleFailure(null, null, Object.assign(new Error("not found"), { httpStatus: 404 })), false);
  assert.equal(canRetryScheduleFailure(null, null, Object.assign(new Error("invalid board"), { httpStatus: 422 })), false);
});

test("retry delay grows exponentially and is capped at 30 minutes", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 10].map(getScheduleRetryDelayMinutes), [1, 2, 4, 8, 16, 30, 30]);
});


test("schedule snapshot captures bounded creative and resolved destination", () => {
  const snapshot = buildPinScheduleSnapshot({
    title: "A".repeat(150), description: "B".repeat(900), image_url: "https://cdn.example/pin-1.jpg",
  }, "https://example.com/article");
  assert.equal(snapshot.snapshot_title.length, 100);
  assert.equal(snapshot.snapshot_description.length, 800);
  assert.equal(snapshot.snapshot_image_url, "https://cdn.example/pin-1.jpg");
  assert.equal(snapshot.snapshot_destination_url, "https://example.com/article");
});

test("scheduled publication resolves the immutable snapshot after live pin edits", () => {
  const resolved = resolvePinScheduleSnapshot({
    snapshot_title: "Scheduled title", snapshot_description: "Scheduled copy",
    snapshot_image_url: "https://cdn.example/old.jpg", snapshot_destination_url: "https://old.example/",
  }, { title: "Edited title", description: "Edited copy", image_url: "https://cdn.example/new.jpg" });
  assert.deepEqual(resolved, {
    title: "Scheduled title", description: "Scheduled copy", image_url: "https://cdn.example/old.jpg",
    destination_url: "https://old.example/", is_snapshot: true,
  });
});

test("legacy schedules without snapshots retain live-pin compatibility", () => {
  const resolved = resolvePinScheduleSnapshot({ destination_url: "https://chosen.example/" }, {
    title: "Current", description: "Current copy", image_url: "https://cdn.example/current.jpg",
  });
  assert.equal(resolved.is_snapshot, false);
  assert.equal(resolved.title, "Current");
  assert.equal(resolved.image_url, "https://cdn.example/current.jpg");
});


test("legacy schedule account recovery uses the only active Pinterest account", () => {
  const account = { id: "account-a" };
  assert.deepEqual(classifyLegacyScheduleAccount([account]), { status: "selected", account });
});

test("legacy schedule account recovery requires explicit choice when multiple accounts exist", () => {
  const accounts = [{ id: "account-a" }, { id: "account-b" }];
  assert.deepEqual(classifyLegacyScheduleAccount(accounts), { status: "selection_required" });
  assert.deepEqual(classifyLegacyScheduleAccount(accounts, "account-b"), {
    status: "selected", account: accounts[1],
  });
});

test("legacy schedule account recovery never guesses when no account is connected", () => {
  assert.deepEqual(classifyLegacyScheduleAccount([]), { status: "no_account" });
});

test("legacy schedule account recovery rejects an account not in the user's active list", () => {
  assert.deepEqual(classifyLegacyScheduleAccount([{ id: "account-a" }], "other-user-account"), {
    status: "invalid_selection",
  });
});


test("failed schedules expose a safe board-unavailable reason without leaking raw provider errors", () => {
  assert.equal(getScheduleFailureReason({
    status: "failed",
    last_error: "Выбранная доска не найдена или недоступна подключённому Pinterest-аккаунту",
  }), "board_unavailable");
  assert.equal(getScheduleFailureReason({
    status: "failed",
    last_error: "Pinterest не подтвердил принадлежность выбранной доски аккаунту",
  }), "board_unavailable");
  assert.equal(getScheduleFailureReason({
    status: "failed",
    last_error: "Unexpected internal error with provider details",
  }), null);
  assert.equal(getScheduleFailureReason({
    status: "scheduled",
    last_error: "Выбранная доска не найдена",
  }), null);
});

test("public schedule payloads never expose raw provider diagnostics", () => {
  const row = {
    id: "schedule-1",
    status: "failed",
    last_error: "Provider response included internal diagnostic details",
    claim_token: "private-worker-claim-token",
    failure_reason: "board_unavailable",
    retryable: false,
  };
  const publicRow = sanitizeScheduleForClient(row);
  assert.equal(publicRow.id, "schedule-1");
  assert.equal(publicRow.failure_reason, "board_unavailable");
  assert.equal(publicRow.retryable, false);
  assert.equal(Object.hasOwn(publicRow, "last_error"), false);
  assert.equal(Object.hasOwn(publicRow, "claim_token"), false);
  // Sanitizing the API object must not mutate the database-shaped source row.
  assert.match(row.last_error, /internal diagnostic details/);
  assert.equal(row.claim_token, "private-worker-claim-token");
});

test("retryability allows a failed schedule without any publication attempt", () => {
  assert.deepEqual(getScheduleRetryability({
    status: "failed", pinterest_account_id: "account-a", pinterest_board_id: "board-a",
    pins: { image_url: "https://cdn.example/pin.jpg" },
  }, null, false, true, false), { retryable: true, reason: null });
});

test("retryability accepts the immutable schedule image when the live pin image was cleared", () => {
  assert.deepEqual(getScheduleRetryability({
    status: "failed",
    pinterest_account_id: "account-a",
    pinterest_board_id: "board-a",
    snapshot_image_url: "https://cdn.example/scheduled-snapshot.jpg",
    pins: { image_url: null },
  }, null, false, true, false), { retryable: true, reason: null });
});

test("retryability allows only explicitly safe failed journal entries", () => {
  const schedule = {
    status: "failed", pinterest_account_id: "account-a", pinterest_board_id: "board-a",
    pins: { image_url: "https://cdn.example/pin.jpg" },
  };
  assert.deepEqual(getScheduleRetryability(schedule, { status: "failed", retry_safe: true }, false, true, false), {
    retryable: true, reason: null,
  });
  assert.equal(getScheduleRetryability(schedule, { status: "failed", retry_safe: false }, false, true, false).retryable, false);
  assert.equal(getScheduleRetryability(schedule, { status: "unknown", retry_safe: true }, false, true, false).retryable, false);
  assert.equal(getScheduleRetryability(schedule, { status: "processing", retry_safe: true }, false, true, false).retryable, false);
});

test("retryability blocks missing account, board, pin, publication, and duplicate active schedule", () => {
  const schedule = {
    status: "failed", pinterest_account_id: "account-a", pinterest_board_id: "board-a",
    pins: { image_url: "https://cdn.example/pin.jpg" },
  };
  assert.equal(getScheduleRetryability({ ...schedule, pinterest_account_id: null }, null, false, false, false).reason, "account_unavailable");
  assert.equal(getScheduleRetryability({ ...schedule, pinterest_board_id: null }, null, false, true, false).reason, "board_missing");
  assert.equal(getScheduleRetryability({ ...schedule, pins: { image_url: null } }, null, false, true, false).reason, "pin_unavailable");
  assert.equal(getScheduleRetryability(schedule, null, true, true, false).reason, "publication_exists");
  assert.equal(getScheduleRetryability(schedule, null, false, true, true).reason, "active_schedule_exists");
});


test("thrown Pinterest 5xx responses are ambiguous and cannot authorize a retry", () => {
  for (const status of [500, 502, 503, 504, 0, NaN]) {
    assert.equal(isPinterestPublishOutcomeUnknown(status), true, `status ${status}`);
  }
});

test("explicit Pinterest client rejections are known not to have created a pin", () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    assert.equal(isPinterestPublishOutcomeUnknown(status), false, `status ${status}`);
  }
});


test("failed publication journal persistence returns an explicit safe-to-stop error", async () => {
  const calls = [];
  await assert.rejects(
    persistPublishFailureJournal(async (name, params) => {
      calls.push({ name, params });
      return { error: { message: "database unavailable" } };
    }, {
      p_user_id: "user-1",
      p_pin_id: "pin-1",
      p_pinterest_account_id: "account-1",
      p_error: "Pinterest timed out",
      p_outcome_unknown: true,
    }),
    (error) => {
      assert.equal(error.httpStatus, 503);
      assert.equal(error.code, "PUBLISH_JOURNAL_PERSISTENCE_FAILED");
      assert.match(error.message, /заблокирована до сверки/);
      return true;
    }
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "fail_pinterest_publish_v2");
  assert.equal(calls[0].params.p_outcome_unknown, true);
});

test("successful publication failure journaling does not raise an error", async () => {
  let callCount = 0;
  await persistPublishFailureJournal(async () => {
    callCount += 1;
    return { error: null };
  }, { p_user_id: "user-1", p_pin_id: "pin-1", p_pinterest_account_id: "account-1" });
  assert.equal(callCount, 1);
});


test("thrown journal transport errors are normalized to a safe 503", async () => {
  await assert.rejects(
    persistPublishFailureJournal(async () => {
      throw new Error("connection reset");
    }, {}),
    (error) => error.httpStatus === 503 && error.code === "PUBLISH_JOURNAL_PERSISTENCE_FAILED"
  );
});


test("worker trusts a published journal only when user, pin, account and board all match", () => {
  const schedule = {
    user_id: "user-1",
    pin_id: "pin-1",
    pinterest_account_id: "account-1",
    pinterest_board_id: "board-1",
  };
  const attempt = {
    user_id: "user-1",
    pin_id: "pin-1",
    pinterest_account_id: "account-1",
    pinterest_board_id: "board-1",
    status: "published",
    pinterest_pin_id: "remote-1",
  };
  assert.equal(hasMatchingScheduleAttemptIdentity(attempt, schedule), true);
  for (const field of ["user_id", "pin_id", "pinterest_account_id", "pinterest_board_id"]) {
    assert.equal(hasMatchingScheduleAttemptIdentity({ ...attempt, [field]: "different" }, schedule), false, field);
  }
  assert.equal(hasMatchingScheduleAttemptIdentity(null, schedule), false);
});

test("existing published reservation is accepted only for the exact board and a non-empty remote ID", () => {
  assert.deepEqual(
    resolvePublishedReservation({ pinterest_pin_id: " remote-1 ", pinterest_board_id: " board-1 " }, "board-1"),
    { pinterest_pin_id: "remote-1", pinterest_board_id: "board-1" }
  );
  assert.throws(
    () => resolvePublishedReservation({ pinterest_pin_id: "remote-1", pinterest_board_id: "board-2" }, "board-1"),
    (error) => error.httpStatus === 409 && error.code === "PINTEREST_PUBLICATION_IDENTITY_MISMATCH"
  );
  assert.throws(
    () => resolvePublishedReservation({ pinterest_pin_id: "", pinterest_board_id: "board-1" }, "board-1"),
    (error) => error.httpStatus === 409
  );
});

test("worker failure mutation requires every schedule identity and claim field", () => {
  const schedule = {
    id: "schedule-1",
    user_id: "user-1",
    pin_id: "pin-1",
    pinterest_account_id: "account-1",
    pinterest_board_id: "board-1",
    claim_token: "claim-1",
  };
  assert.equal(hasCompleteScheduleClaimIdentity(schedule), true);
  for (const field of Object.keys(schedule)) {
    const incomplete = { ...schedule, [field]: " " };
    assert.equal(hasCompleteScheduleClaimIdentity(incomplete), false, field);
  }
  assert.equal(hasCompleteScheduleClaimIdentity(null), false);
});

test("worker confirms a conditional schedule update actually changed its claimed row", () => {
  assert.equal(isScheduleClaimUpdateConfirmed({ data: { id: "schedule-1" }, error: null }), true);
  assert.equal(isScheduleClaimUpdateConfirmed({ data: null, error: null }), false);
  assert.equal(isScheduleClaimUpdateConfirmed({ data: null, error: new Error("database unavailable") }), false);
  assert.equal(isScheduleClaimUpdateConfirmed(null), false);
});

test("worker journal lookup failure remains unknown and never authorizes a retry", () => {
  const state = buildScheduleWorkerFailureState({
    attempt: null,
    attemptLookupError: new Error("database connection reset"),
    error: new Error("worker failed"),
    attempts: 1,
    now: Date.parse("2026-11-09T12:00:00.000Z"),
  });
  assert.equal(state.finalStatus, "unknown");
  assert.equal(state.retryable, false);
  assert.equal(state.shouldRetry, false);
  assert.equal(state.nextStatus, "unknown");
  assert.equal(state.retryAt, null);
  assert.match(state.message, /Could not verify publication journal/);
});

test("worker safely retries only a journal-confirmed retry-safe rejection", () => {
  const state = buildScheduleWorkerFailureState({
    attempt: { status: "failed", retry_safe: true },
    error: Object.assign(new Error("Pinterest rejected before creation"), { httpStatus: 403 }),
    attempts: 2,
    now: Date.parse("2026-11-09T12:00:00.000Z"),
  });
  assert.equal(state.finalStatus, "failed");
  assert.equal(state.shouldRetry, true);
  assert.equal(state.nextStatus, "scheduled");
  assert.equal(state.retryAt, "2026-11-09T12:02:00.000Z");
});

test("worker does not retry after reaching the bounded retry limit", () => {
  const state = buildScheduleWorkerFailureState({
    attempt: { status: "failed", retry_safe: true },
    error: new Error("temporary"),
    attempts: 5,
    now: Date.parse("2026-11-09T12:00:00.000Z"),
  });
  assert.equal(state.retryable, true);
  assert.equal(state.shouldRetry, false);
  assert.equal(state.nextStatus, "failed");
  assert.equal(state.retryAt, null);
});

test("a confirmed publication remains published even if later worker work fails", () => {
  const state = buildScheduleWorkerFailureState({
    attempt: { status: "published", pinterest_pin_id: "remote-1" },
    error: new Error("post-publication worker failure"),
    attempts: 1,
  });
  assert.equal(state.finalStatus, "published");
  assert.equal(state.nextStatus, "published");
  assert.equal(state.shouldRetry, false);
});

test("retryability rejects a safe journal whose owner, pin, account, or board differs from the schedule", () => {
  const schedule = {
    status: "failed",
    user_id: "user-1",
    pin_id: "pin-1",
    pinterest_account_id: "account-1",
    pinterest_board_id: "board-1",
    pins: { image_url: "https://cdn.example/pin.jpg" },
  };
  const attempt = {
    user_id: "user-1",
    pin_id: "pin-1",
    pinterest_account_id: "account-1",
    pinterest_board_id: "board-1",
    status: "failed",
    retry_safe: true,
  };
  assert.deepEqual(getScheduleRetryability(schedule, attempt, false, true, false), {
    retryable: true, reason: null,
  });
  for (const field of ["user_id", "pin_id", "pinterest_account_id", "pinterest_board_id"]) {
    assert.deepEqual(
      getScheduleRetryability(schedule, { ...attempt, [field]: "different" }, false, true, false),
      { retryable: false, reason: "attempt_identity_mismatch" },
      field
    );
  }
});
