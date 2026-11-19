import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  DEFAULT_GENERATION_MAX_WAIT_MS,
  DEFAULT_GENERATION_WAIT_SECONDS,
  getGenerationInProgressWait,
  runGenerationWithRecovery,
} from './generationPolling';

/**
 * Reloading the page while pins are being generated used to show an error: the backend
 * answers 409 `generation_in_progress` for a key that is already running, and the UI had no
 * rule for it. The server expects the client to wait and replay the *same* key — the
 * finished result is returned to that key, and rotating it would start and charge a second
 * generation. These tests cover the loop without sleeping for real.
 */

const SRC = path.dirname(fileURLToPath(import.meta.url));

const inProgress = (retryAfterSeconds?: number) => ({
  status: 409,
  data: { code: 'generation_in_progress', ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) },
});

function harnessClock() {
  let current = 0;
  return {
    now: () => current,
    advance: (ms: number) => { current += ms; },
  };
}

const sleepThatAdvances = (clock: ReturnType<typeof harnessClock>, waits: number[]) => async (ms: number) => {
  waits.push(ms);
  clock.advance(ms);
};

test('the "still running" signal is recognized and its wait is read', () => {
  assert.equal(getGenerationInProgressWait(inProgress(5)), 5);
  assert.equal(getGenerationInProgressWait(inProgress(0)), 0);
  // A missing field must not turn a recoverable state into a failure.
  assert.equal(getGenerationInProgressWait(inProgress()), DEFAULT_GENERATION_WAIT_SECONDS);
  // A hostile value cannot pin the client.
  assert.equal(getGenerationInProgressWait(inProgress(99_999)), 300);
});

test('anything that is not "still running" is not treated as one', () => {
  assert.equal(getGenerationInProgressWait(null), null);
  assert.equal(getGenerationInProgressWait('boom'), null);
  assert.equal(getGenerationInProgressWait({ status: 500, data: { code: 'generation_in_progress' } }), null);
  assert.equal(getGenerationInProgressWait({ status: 409, data: { code: 'generation_request_failed' } }), null);
  assert.equal(getGenerationInProgressWait({ status: 409, data: null }), null);
  assert.equal(getGenerationInProgressWait({ status: 410, data: { code: 'idempotency_result_expired' } }), null);
});

test('a generation that is already running is waited out and then returns its result', async () => {
  const clock = harnessClock();
  const waits: number[] = [];
  let calls = 0;
  const result = await runGenerationWithRecovery(
    async () => {
      calls += 1;
      if (calls <= 2) throw inProgress(5);
      return [{ id: 'pin-1' }];
    },
    { sleep: sleepThatAdvances(clock, waits), now: clock.now, getWaitSeconds: getGenerationInProgressWait }
  );

  assert.deepEqual(result, [{ id: 'pin-1' }]);
  assert.equal(calls, 3, 'the same request must be replayed with the same key');
  assert.deepEqual(waits, [5000, 5000], 'the wait the server asked for must be honoured');
});

test('a genuine failure is rethrown immediately, without waiting', async () => {
  const clock = harnessClock();
  const waits: number[] = [];
  const failure = { status: 500, data: { code: 'internal' } };
  let calls = 0;
  await assert.rejects(
    runGenerationWithRecovery(
      async () => {
        calls += 1;
        throw failure;
      },
      { sleep: sleepThatAdvances(clock, waits), now: clock.now, getWaitSeconds: getGenerationInProgressWait }
    ),
    (error) => error === failure
  );
  assert.equal(calls, 1);
  assert.deepEqual(waits, []);
});

test('the waiting budget is bounded and the last real error is reported', async () => {
  const clock = harnessClock();
  const waits: number[] = [];
  let calls = 0;
  await assert.rejects(
    runGenerationWithRecovery(
      async () => {
        calls += 1;
        throw inProgress(30);
      },
      {
        sleep: sleepThatAdvances(clock, waits),
        now: clock.now,
        getWaitSeconds: getGenerationInProgressWait,
        maxWaitMs: 60_000,
      }
    ),
    (error: any) => error?.data?.code === 'generation_in_progress'
  );
  // Two 30 s waits fit in the 60 s budget; the third would exceed it.
  assert.equal(calls, 3);
  assert.deepEqual(waits, [30_000, 30_000]);
});

test('a server that answers "in progress" with no wait cannot cause a hot loop', async () => {
  const clock = harnessClock();
  let calls = 0;
  await assert.rejects(
    runGenerationWithRecovery(
      async () => {
        calls += 1;
        throw inProgress(0);
      },
      {
        sleep: async () => {},
        now: clock.now,
        getWaitSeconds: getGenerationInProgressWait,
        maxAttempts: 4,
      }
    ),
    (error: any) => error?.data?.code === 'generation_in_progress'
  );
  assert.equal(calls, 4, 'the attempt cap must end the loop even at zero wait');
});

test('the defaults leave room for a long generation but not forever', () => {
  assert.ok(DEFAULT_GENERATION_MAX_WAIT_MS >= 5 * 60_000);
  assert.ok(DEFAULT_GENERATION_MAX_WAIT_MS <= 20 * 60_000);
});

test('the generator replays the same idempotency key instead of rotating it', () => {
  const generator = readFileSync(path.join(SRC, '../components/pins/PinGenerator.tsx'), 'utf8');
  assert.match(generator, /runGenerationWithRecovery\(/);
  // The key is captured once and used by every replay.
  assert.match(generator, /const generationKey = generationKeyRef\.current \|\| '';/);
  assert.match(generator, /headers: \{ 'Idempotency-Key': generationKey \}/);
  // Rotating the key is only allowed for a definitive failure.
  assert.match(generator, /if \(isDefinitiveGenerationFailure\(err\)\)/);
});

test('the backend states the wait in the body, not only in a header', () => {
  const backend = readFileSync(path.join(SRC, '../../../backend/index.js'), 'utf8');
  const bodyLine = /code: "generation_in_progress", retryAfterSeconds: (\d+)/.exec(backend);
  assert.ok(bodyLine, 'the 409 body must carry retryAfterSeconds');
  assert.ok(Number(bodyLine[1]) > 0 && Number(bodyLine[1]) <= 60);
  // The header and the body must agree, or a client reading either one sees different waits.
  const headerBefore = backend.slice(Math.max(0, bodyLine.index - 400), bodyLine.index);
  assert.match(headerBefore, new RegExp(`res\\.set\\("Retry-After", "${bodyLine[1]}"\\)`));
});
