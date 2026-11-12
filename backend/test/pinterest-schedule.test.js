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
  isScheduleClaimLostError,
  resolvePublishedReservation,
  matchesConfirmedPublicationLedger,
  persistPublishFailureJournal,
  persistKnownRemotePublishOutcome,
  isPinterestPublishOutcomeUnknown,
  buildPinScheduleSnapshot,
  resolvePinScheduleSnapshot,
  classifyLegacyScheduleAccount,
  getScheduleRetryability,
  selectScheduleAttemptForRetry,
  getScheduleFailureReason,
  sanitizeScheduleForClient,
  createScheduleClaimHeartbeat,
} = require("../pinterestSchedule");

test("confirmed publication ledger matching requires every identity field to be non-empty", () => {
  const identity = {
    user_id: "user-1",
    pin_id: "pin-1",
    pinterest_account_id: "account-1",
    pinterest_board_id: "board-1",
    pinterest_pin_id: "remote-pin-1",
  };

  assert.equal(matchesConfirmedPublicationLedger({ ...identity }, { ...identity }), true);

  for (const field of Object.keys(identity)) {
    assert.equal(
      matchesConfirmedPublicationLedger({ ...identity, [field]: "" }, { ...identity, [field]: "" }),
      false,
      `blank ledger and expected ${field}`
    );
    assert.equal(
      matchesConfirmedPublicationLedger({ ...identity, [field]: "   " }, { ...identity }),
      false,
      `whitespace ledger ${field}`
    );
    assert.equal(
      matchesConfirmedPublicationLedger({ ...identity }, { ...identity, [field]: "" }),
      false,
      `blank expected ${field}`
    );
  }

  assert.equal(matchesConfirmedPublicationLedger(null, identity), false);
  assert.equal(matchesConfirmedPublicationLedger(identity, null), false);
});

test("a disconnected Pinterest account before publication is a terminal failure", () => {
  assert.equal(classifyScheduleFailure(null, null), "failed");
});

test("schedule attempt identity requires every non-empty owner and destination field", () => {
  const identity = { user_id: "user-1", pin_id: "pin-1", pinterest_account_id: "account-1", pinterest_board_id: "board-1" };
  assert.equal(hasMatchingScheduleAttemptIdentity({ ...identity }, { ...identity }), true);
  for (const field of Object.keys(identity)) {
    assert.equal(hasMatchingScheduleAttemptIdentity({ ...identity, [field]: "" }, { ...identity, [field]: "" }), false, `blank ${field}`);
    assert.equal(hasMatchingScheduleAttemptIdentity({ ...identity, [field]: "   " }, { ...identity }), false, `whitespace ${field}`);
  }
  assert.equal(hasMatchingScheduleAttemptIdentity(identity, { ...identity, pinterest_board_id: "other-board" }), false);
});

test("an unreadable publish journal is unknown and must not be retried", () => {
  assert.equal(classifyScheduleFailure(null, new Error("database unavailable")), "unknown");
  assert.equal(canRetryScheduleFailure(null, new Error("database unavailable"), new Error("503")), false);
});

test("a confirmed remote publication wins over a later worker error", () => {
  const attempt = {
    user_id: "user-1", pin_id: "pin-1", pinterest_account_id: "account-1",
    pinterest_board_id: "board-1", status: "published", pinterest_pin_id: "remote-pin-123",
  };
  const ledger = {
    user_id: "user-1", pin_id: "pin-1", pinterest_account_id: "account-1",
    pinterest_board_id: "board-1", pinterest_pin_id: "remote-pin-123",
  };
  assert.equal(classifyScheduleFailure(attempt, null), "unknown", "journal alone is not publication proof");
  assert.equal(classifyScheduleFailure(attempt, null, ledger), "published");
  assert.equal(classifyScheduleFailure(attempt, null, { ...ledger, pinterest_board_id: "other-board" }), "unknown");
  assert.equal(classifyScheduleFailure(attempt, null, ledger, new Error("ledger lookup failed")), "unknown");
});

test("an ambiguous or still-processing publish attempt remains non-retryable", () => {
  assert.equal(classifyScheduleFailure({ status: "unknown" }, null), "unknown");
  assert.equal(classifyScheduleFailure({ status: "processing" }, null), "unknown");
  assert.equal(canRetryScheduleFailure({ status: "unknown" }, null, Object.assign(new Error("503"), { httpStatus: 503 })), false);
});

test("a failed journal retries only when the database marks it safe", () => {
  assert.equal(classifyScheduleFailure({ status: "failed", retry_safe: false }, null), "failed");
  assert.equal(canRetryScheduleFailure({ status: "failed", retry_safe: false }, null, Object.assign(new Error("503"), { httpStatus: 503 })), false);
  // A 403 means credentials/account state must be corrected first: the older
  // retry-safe journal row must not authorize an automatic retry.
  assert.equal(canRetryScheduleFailure({ status: "failed", retry_safe: true }, null, Object.assign(new Error("403"), { httpStatus: 403 })), false);
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
test("known client rejections never inherit an older retry-safe journal", () => {
  const previousSafeAttempt = { status: "failed", retry_safe: true };
  for (const httpStatus of [400, 401, 403, 404, 409, 422]) {
    assert.equal(
      canRetryScheduleFailure(previousSafeAttempt, null, Object.assign(new Error("known client rejection"), { httpStatus })),
      false,
      `HTTP ${httpStatus} must not inherit retry permission`
    );
  }
  // Rate limits and timeouts are ambiguous and remain governed by the durable
  // journal; they must not be converted into automatic retries here.
  for (const httpStatus of [408, 429]) {
    assert.equal(
      canRetryScheduleFailure(previousSafeAttempt, null, Object.assign(new Error("ambiguous response"), { httpStatus })),
      true,
      `HTTP ${httpStatus} remains journal-governed`
    );
  }
});

test("terminal Pinterest preflight failures never inherit an older retry-safe journal", () => {
  const previousSafeAttempt = { status: "failed", retry_safe: true };
  for (const [httpStatus, message] of [
    [404, "Pinterest account unavailable"],
    [409, "Pinterest account is not connected"],
    [422, "Select a Pinterest account"],
  ]) {
    const terminalError = Object.assign(new Error(message), {
      httpStatus,
      retryable: false,
    });
    assert.equal(
      canRetryScheduleFailure(previousSafeAttempt, null, terminalError),
      false,
      `HTTP ${httpStatus} must not be retried automatically`
    );
  }
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
    status: "failed", user_id: "user-1", pin_id: "pin-1", pinterest_account_id: "account-a", pinterest_board_id: "board-a",
    pins: { image_url: "https://cdn.example/pin.jpg" },
  }, null, false, true, false), { retryable: true, reason: null });
});

test("retryability accepts the immutable schedule image when the live pin image was cleared", () => {
  assert.deepEqual(getScheduleRetryability({
    status: "failed",
    user_id: "user-1", pin_id: "pin-1",
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
  // A journal row only authorizes a retry when it still identifies this exact
  // account and board, so the fixture carries the identity fields.
  const attempt = (overrides) => ({
    user_id: "user-1", pin_id: "pin-1", pinterest_account_id: "account-a", pinterest_board_id: "board-a", ...overrides,
  });
  assert.deepEqual(getScheduleRetryability(schedule, attempt({ status: "failed", retry_safe: true }), false, true, false), {
    retryable: true, reason: null,
  });
  assert.equal(getScheduleRetryability(schedule, attempt({ status: "failed", retry_safe: false }), false, true, false).retryable, false);
  assert.equal(getScheduleRetryability(schedule, attempt({ status: "unknown", retry_safe: true }), false, true, false).retryable, false);
  assert.equal(getScheduleRetryability(schedule, attempt({ status: "processing", retry_safe: true }), false, true, false).retryable, false);
});

test("retryability fails closed when schedule owner or pin identity is missing or blank", () => {
  const schedule = {
    status: "failed", user_id: "user-1", pin_id: "pin-1",
    pinterest_account_id: "account-a", pinterest_board_id: "board-a",
    pins: { image_url: "https://cdn.example/pin.jpg" },
  };
  for (const field of ["user_id", "pin_id", "pinterest_account_id", "pinterest_board_id"]) {
    for (const value of ["", "   ", null]) {
      assert.deepEqual(
        getScheduleRetryability({ ...schedule, [field]: value }, null, false, true, false),
        { retryable: false, reason: "schedule_identity_incomplete" },
        `${field}=${String(value)}`
      );
    }
  }
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


test("Pinterest non-success responses outside the explicit client-rejection allowlist are ambiguous", () => {
  // This same classifier is used for both returned HTTP responses and thrown
  // transport errors around POST /pins. Unexpected redirects must not become
  // retry-safe merely because they are not 408/429/5xx.
  for (const status of [0, 300, 301, 302, 408, 429, 500, 502, 503, 504, NaN]) {
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

test("ambiguous completion is confirmed only by an exact durable publication ledger match", () => {
  const expected = {
    user_id: "user-1",
    pin_id: "pin-1",
    pinterest_account_id: "account-1",
    pinterest_board_id: "board-1",
    pinterest_pin_id: "remote-pin-1",
  };
  assert.equal(matchesConfirmedPublicationLedger({ ...expected }, expected), true);
  for (const field of Object.keys(expected)) {
    assert.equal(
      matchesConfirmedPublicationLedger({ ...expected, [field]: "different" }, expected),
      false,
      field
    );
  }
  assert.equal(matchesConfirmedPublicationLedger(null, expected), false);
  assert.equal(matchesConfirmedPublicationLedger({ ...expected }, null), false);
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

test("worker publication ledger lookup failure explains that confirmation is unavailable", () => {
  const state = buildScheduleWorkerFailureState({
    attempt: {
      user_id: "user-1", pin_id: "pin-1", pinterest_account_id: "account-1",
      pinterest_board_id: "board-1", status: "published", pinterest_pin_id: "remote-1",
    },
    publicationLedgerLookupError: new Error("database connection reset"),
    error: new Error("worker failed"),
    attempts: 1,
  });
  assert.equal(state.finalStatus, "unknown");
  assert.equal(state.retryable, false);
  assert.equal(state.shouldRetry, false);
  assert.match(state.message, /Не удалось сверить подтверждение публикации/);
  assert.match(state.message, /повторная публикация заблокирована/);
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
  assert.match(state.message, /Не удалось проверить журнал публикации/);
});

test("worker safely retries only a journal-confirmed retry-safe rejection", () => {
  // A retry-safe journal row authorizes an automatic retry for an ambiguous
  // failure (throttle/timeout/5xx), but never for a deterministic 4xx rejection.
  const ambiguous = buildScheduleWorkerFailureState({
    attempt: { status: "failed", retry_safe: true },
    error: Object.assign(new Error("provider throttled"), { httpStatus: 429 }),
    attempts: 2,
    now: Date.parse("2026-11-09T12:00:00.000Z"),
  });
  assert.equal(ambiguous.finalStatus, "failed");
  assert.equal(ambiguous.shouldRetry, true);
  assert.equal(ambiguous.nextStatus, "scheduled");
  assert.equal(ambiguous.retryAt, "2026-11-09T12:02:00.000Z");

  const deterministic = buildScheduleWorkerFailureState({
    attempt: { status: "failed", retry_safe: true },
    error: Object.assign(new Error("Pinterest rejected before creation"), { httpStatus: 403 }),
    attempts: 2,
    now: Date.parse("2026-11-09T12:00:00.000Z"),
  });
  assert.equal(deterministic.finalStatus, "failed");
  assert.equal(deterministic.shouldRetry, false);
  assert.equal(deterministic.nextStatus, "failed");
  assert.equal(deterministic.retryAt, null);
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
    attempt: {
      user_id: "user-1", pin_id: "pin-1", pinterest_account_id: "account-1",
      pinterest_board_id: "board-1", status: "published", pinterest_pin_id: "remote-1",
    },
    publicationLedger: {
      user_id: "user-1", pin_id: "pin-1", pinterest_account_id: "account-1",
      pinterest_board_id: "board-1", pinterest_pin_id: "remote-1",
    },
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


test("schedule worker claim size is enforced server-side as one until leases are renewable", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "../pinterest.js"), "utf8");
  assert.match(source, /const limit = 1;/);
  assert.doesNotMatch(source, /const limit = Math\.max\(1, Math\.min\(Number\(req\.body && req\.body\.limit\)/);
});


test("schedule claim heartbeat renews while active, avoids overlap, and stops cleanly", async () => {
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  const warnings = [];
  const stop = createScheduleClaimHeartbeat({
    intervalMs: 10,
    renew: async () => {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 25));
      active -= 1;
      return true;
    },
    logger: { warn: (...args) => warnings.push(args) },
  });

  await new Promise((resolve) => setTimeout(resolve, 75));
  await stop();
  const callsAtStop = calls;
  await new Promise((resolve) => setTimeout(resolve, 35));

  assert.ok(callsAtStop >= 2, "long-running work should renew its lease repeatedly");
  assert.equal(calls, callsAtStop, "stopped heartbeat must not schedule more renewals");
  assert.equal(maxActive, 1, "slow database heartbeats must never overlap");
  assert.deepEqual(warnings, []);
});

test("stopping schedule claim heartbeat waits for an in-flight renewal", async () => {
  let finishRenewal;
  let stopped = false;
  const stop = createScheduleClaimHeartbeat({
    intervalMs: 10,
    renew: () => new Promise((resolve) => { finishRenewal = resolve; }),
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const stopping = stop().then(() => { stopped = true; });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(stopped, false, "stop must wait for the active database renewal");
  finishRenewal(true);
  await stopping;
  assert.equal(stopped, true);
});

test("schedule claim heartbeat warns once when fencing token is no longer current", async () => {
  const warnings = [];
  const stop = createScheduleClaimHeartbeat({
    intervalMs: 10,
    renew: async () => false,
    logger: { warn: (...args) => warnings.push(args) },
  });
  assert.equal(stop.isLeaseLost(), false);
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.equal(stop.isLeaseLost(), true);
  await stop();
  assert.equal(warnings.length, 1);
  assert.match(warnings[0][0], /claim is no longer current/);
});


test("schedule claim heartbeat does not declare lease lost on a transient renewal error", async () => {
  const stop = createScheduleClaimHeartbeat({
    intervalMs: 10,
    renew: async () => { throw new Error("database connection reset"); },
    logger: { warn: () => {} },
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(stop.isLeaseLost(), false, "a transport error is not proof that the fencing token was replaced");
  await stop();
});

test("schedule claim heartbeat logs one warning when the renewal request throws", async () => {
  const warnings = [];
  const stop = createScheduleClaimHeartbeat({
    intervalMs: 10,
    renew: async () => { throw new Error("database connection reset"); },
    logger: { warn: (...args) => warnings.push(args) },
  });
  await new Promise((resolve) => setTimeout(resolve, 45));
  stop();
  assert.equal(warnings.length, 1);
  assert.match(warnings[0][0], /heartbeat failed/);
});


test("a lost schedule claim is a definitive pre-publication fence", () => {
  assert.equal(isScheduleClaimLostError(Object.assign(new Error("claim lost"), {
    code: "SCHEDULE_CLAIM_LOST",
    httpStatus: 409,
  })), true);
  assert.equal(isScheduleClaimLostError(Object.assign(new Error("database unavailable"), {
    httpStatus: 503,
  })), false);
  assert.equal(isScheduleClaimLostError(new Error("ordinary Pinterest failure")), false);
  assert.equal(isScheduleClaimLostError(null), false);
});


test("known Pinterest remote ID is persisted through the dedicated unknown-outcome RPC", async () => {
  const calls = [];
  const result = await persistKnownRemotePublishOutcome(async (name, params) => {
    calls.push({ name, params });
    return { data: true, error: null };
  }, {
    p_user_id: "user-1",
    p_pin_id: "pin-1",
    p_pinterest_account_id: "account-1",
    p_pinterest_board_id: "board-1",
    p_pinterest_pin_id: "remote-pin-1",
    p_error: "local completion failed",
  });

  assert.equal(result, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "record_pinterest_publish_unknown_v2");
  assert.equal(calls[0].params.p_pinterest_pin_id, "remote-pin-1");
  assert.equal(calls[0].params.p_pinterest_board_id, "board-1");
});

test("known Pinterest remote ID journal rejects an unconfirmed or malformed RPC result", async () => {
  for (const response of [
    { data: false, error: null },
    { data: null, error: { message: "database unavailable" } },
    null,
  ]) {
    await assert.rejects(
      persistKnownRemotePublishOutcome(async () => response, {}),
      (error) => error.httpStatus === 503 && error.code === "PUBLISH_REMOTE_ID_JOURNAL_FAILED"
    );
  }
  await assert.rejects(
    persistKnownRemotePublishOutcome(async () => { throw new Error("connection reset"); }, {}),
    (error) => error.httpStatus === 503 && error.code === "PUBLISH_REMOTE_ID_JOURNAL_FAILED"
  );
});


test("schedule failure records never persist raw provider or request secrets", () => {
  const state = buildScheduleWorkerFailureState({
    error: Object.assign(new Error("Authorization: Bearer private-token?access_token=secret"), {
      httpStatus: 503,
      code: "ECONNRESET",
    }),
    attempts: 1,
  });
  assert.equal(state.message, "Pinterest publication failed; check the account and schedule status before retrying.");
  assert.equal(state.message.includes("private-token"), false);
  assert.equal(state.message.includes("secret"), false);
});

test("safe schedule failure messages preserve the actionable board-unavailable classification", () => {
  const state = buildScheduleWorkerFailureState({
    error: new Error("Выбранная доска не найдена или недоступна подключённому Pinterest-аккаунту"),
    attempts: 1,
  });
  assert.equal(state.message, "Выбранная доска не найдена или недоступна подключённому Pinterest-аккаунту");
  assert.equal(getScheduleFailureReason({ status: "failed", last_error: state.message }), "board_unavailable");
});

test("unreadable publication journal errors use a fixed safe schedule message", () => {
  const state = buildScheduleWorkerFailureState({
    attemptLookupError: new Error("database password=secret"),
    error: new Error("private provider response"),
  });
  assert.equal(state.message, "Could not verify the publication journal; publication outcome remains unknown.");
});


test("unreadable retry metadata fails closed instead of repeating a possibly accepted publication", () => {
  const hostileRetryable = {};
  Object.defineProperty(hostileRetryable, "retryable", {
    get() { throw new Error("private retry metadata"); },
  });
  assert.equal(canRetryScheduleFailure(null, null, hostileRetryable), false);

  const hostileStatus = {};
  Object.defineProperty(hostileStatus, "httpStatus", {
    get() { throw new Error("private HTTP metadata"); },
  });
  assert.equal(canRetryScheduleFailure(null, null, hostileStatus), false);
  assert.equal(
    canRetryScheduleFailure({ status: "failed", retry_safe: true }, null, hostileRetryable),
    false,
    "hostile fresh metadata must override an older retry-safe journal"
  );
});


test("schedule retry selects the exact board attempt when older attempts target another board", () => {
  const schedule = {
    user_id: "user-1",
    pin_id: "pin-1",
    pinterest_account_id: "account-1",
    pinterest_board_id: "board-current",
  };
  const stale = {
    ...schedule,
    pinterest_board_id: "board-old",
    status: "failed",
    retry_safe: false,
  };
  const current = {
    ...schedule,
    status: "failed",
    retry_safe: true,
  };

  assert.equal(selectScheduleAttemptForRetry([stale, current], schedule), current);
  assert.equal(selectScheduleAttemptForRetry([stale], schedule), stale);
  assert.equal(selectScheduleAttemptForRetry([], schedule), null);
});
