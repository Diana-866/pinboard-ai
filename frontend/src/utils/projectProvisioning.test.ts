import test from 'node:test';
import assert from 'node:assert/strict';
import { getOrCreateProject } from './projectProvisioning';

test('concurrent board creates for one user share one project provisioning request', async () => {
  let loadCount = 0;
  let createCount = 0;
  let releaseCreate: ((value: unknown) => void) | undefined;
  const createGate = new Promise((resolve) => { releaseCreate = resolve; });
  const load = async () => { loadCount += 1; return []; };
  const create = async () => { createCount += 1; return createGate; };

  const first = getOrCreateProject('user-concurrent-1', load, create);
  const second = getOrCreateProject('user-concurrent-1', load, create);
  await Promise.resolve();
  assert.equal(loadCount, 1);
  assert.equal(createCount, 1);
  releaseCreate?.({ id: 'project-shared' });

  assert.deepEqual(await Promise.all([first, second]), [
    { id: 'project-shared' },
    { id: 'project-shared' },
  ]);
});

test('different users provision projects independently', async () => {
  let creates = 0;
  const create = async () => ({ id: `project-${++creates}` });
  const load = async () => [];
  const [a, b] = await Promise.all([
    getOrCreateProject('user-a', load, create),
    getOrCreateProject('user-b', load, create),
  ]);
  assert.notEqual(a.id, b.id);
  assert.equal(creates, 2);
});

test('a failed attempt is released so a later retry can read the committed project', async () => {
  let loadCount = 0;
  let createCount = 0;
  await assert.rejects(
    getOrCreateProject('user-retry-1', async () => {
      loadCount += 1;
      return [];
    }, async () => {
      createCount += 1;
      throw new Error('response lost');
    }),
    /response lost/,
  );

  const recovered = await getOrCreateProject('user-retry-1', async () => {
    loadCount += 1;
    return [{ id: 'project-committed' }];
  }, async () => {
    createCount += 1;
    return { id: 'unexpected-duplicate' };
  });

  assert.deepEqual(recovered, { id: 'project-committed' });
  assert.equal(loadCount, 2);
  assert.equal(createCount, 1);
});

test('rejects malformed project list and missing owner/project identity', async () => {
  await assert.rejects(getOrCreateProject('', async () => [], async () => ({ id: 'p' })), /пользователя/i);
  await assert.rejects(getOrCreateProject('user-invalid-1', async () => ({}), async () => ({ id: 'p' })), /некорректный список/i);
  await assert.rejects(getOrCreateProject('user-invalid-2', async () => [], async () => ({})), /подтвердить проект/i);
});
