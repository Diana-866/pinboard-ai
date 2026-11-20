import test from 'node:test';
import assert from 'node:assert/strict';
import { getLocalizedApiError } from '../i18n/appErrorCopy';

const LANGUAGES = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'] as const;

function withStoredLanguage<T>(language: string, run: () => T): T {
  const store = new Map<string, string>();
  store.set('pinposy_lang', language);
  (globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    },
  };
  try {
    return run();
  } finally {
    delete (globalThis as any).window;
  }
}

test('a failed generation that spent nothing says so, in every language', () => {
  // Section 115. The database returns the credit reservation when no image was ever requested; the
  // customer previously read "внутренняя ошибка сервера" and could not tell a free failure from a
  // charged one - the difference between retrying and writing to support about money.
  for (const language of LANGUAGES) {
    const message = withStoredLanguage(language, () => getLocalizedApiError('generation_not_charged', 502));
    assert.ok(message && message.trim().length > 0, `${language} must translate generation_not_charged`);
  }
  const english = withStoredLanguage('en', () => getLocalizedApiError('generation_not_charged', 502))!;
  assert.match(english, /nothing was charged/i);
  assert.match(english, /credits are back|back in your balance/i);
  const russian = withStoredLanguage('ru', () => getLocalizedApiError('generation_not_charged', 502))!;
  assert.match(russian, /ничего не списано/);
  assert.match(russian, /баланс/i);
});

test('it names the money fact on any status the route can choose, and never on success', () => {
  withStoredLanguage('en', () => {
    // The route can answer 402, 422, 500 or 502 on a failure that spent nothing.
    for (const status of [402, 422, 500, 502, 503]) {
      assert.ok(getLocalizedApiError('generation_not_charged', status), `status ${status}`);
    }
    for (const status of [200, 201]) {
      assert.equal(getLocalizedApiError('generation_not_charged', status), null, `status ${status}`);
    }
  });
});

test('it never promises a refund', () => {
  const english = withStoredLanguage('en', () => getLocalizedApiError('generation_not_charged', 502))!;
  assert.doesNotMatch(english, /refund/i, 'the reservation was released; nothing is being refunded');
});

test('an unconfirmed outcome is never turned into "nothing was charged"', () => {
  // Section 116. When the provider was asked, the reservation is kept until reconciliation; the
  // customer must read the fenced message, on whatever status carried it.
  withStoredLanguage('en', () => {
    for (const status of [409, 500, 502, 503]) {
      const message = getLocalizedApiError('generation_outcome_unknown', status);
      assert.ok(message, `status ${status} must be localized`);
      assert.doesNotMatch(message!, /nothing was charged/i, `status ${status} must not promise a refund`);
      assert.match(message!, /not been confirmed|not confirmed/i, `status ${status}`);
    }
    for (const status of [200, 402, 422]) {
      assert.equal(getLocalizedApiError('generation_outcome_unknown', status), null, `status ${status}`);
    }
  });
});

test('the message states the money fact and never invents the cause', () => {
  // Section 117. The same code covers two different causes: the model answered with unusable output
  // before any image was requested, and every image task came back failed. The first copy claimed
  // "stopped before any image was requested", which was false in the second case - a paying customer
  // reading a wrong explanation of what happened to their credits.
  // "The credits are back" is the money fact; a translation that loses it says nothing useful.
  const balanceWord: Record<string, RegExp> = {
    en: /balance/i,
    ru: /баланс/i,
    es: /saldo/i,
    pt: /saldo/i,
    de: /Guthaben/i,
    fr: /solde/i,
    zh: /余额/,
  };
  for (const language of LANGUAGES) {
    const message = withStoredLanguage(language, () => getLocalizedApiError('generation_not_charged', 502))!;
    assert.doesNotMatch(
      message,
      /before any image|до запроса изображений|antes de solicitar|antes de pedir|bevor ein Bild|avant toute demande|图片请求之前/i,
      `${language} must not claim a cause it cannot know`
    );
    assert.match(message, balanceWord[language], `${language} must say the credits are back`);
  }
  const english = withStoredLanguage('en', () => getLocalizedApiError('generation_not_charged', 502))!;
  assert.match(english, /nothing was charged/i);
  assert.match(english, /back in your balance/i);
});

test('an unsaved generation says "do not retry", not "check the queue"', () => {
  // Section 118. The images exist and the provider was paid; the write that would show them failed.
  // The request is fenced as `unknown` and its reservation is kept, so a blind retry generates and
  // charges again. The fenced copy ("check the review queue") is wrong here: nothing will appear.
  for (const language of LANGUAGES) {
    const message = withStoredLanguage(language, () => getLocalizedApiError('generation_save_failed', 500));
    assert.ok(message && message.trim().length > 0, `${language} must translate generation_save_failed`);
  }
  const english = withStoredLanguage('en', () => getLocalizedApiError('generation_save_failed', 500))!;
  assert.match(english, /could not be saved|saving them failed/i);
  assert.match(english, /support/i, 'the customer must be sent to a human, not to a retry button');
  assert.doesNotMatch(english, /review queue/i, 'nothing will appear in the queue: the save failed');
  assert.doesNotMatch(english, /nothing was charged/i, 'the credits are still reserved');

  withStoredLanguage('en', () => {
    for (const status of [200, 402, 409, 422]) {
      assert.equal(getLocalizedApiError('generation_save_failed', status), null, `status ${status}`);
    }
  });
});

test('unusable model output says the attempt was free, in every language', () => {
  // Section 119: /analyze, /boards, /pins and /keyword-ideas all refused unusable output with a bare
  // 502, so the screen said "internal server error" and the person could not tell whether it had cost
  // them credits.
  for (const language of LANGUAGES) {
    const message = withStoredLanguage(language, () => getLocalizedApiError('ai_output_invalid', 502));
    assert.ok(message && message.trim().length > 0, `${language} must translate ai_output_invalid`);
  }
  const english = withStoredLanguage('en', () => getLocalizedApiError('ai_output_invalid', 502))!;
  assert.match(english, /nothing was charged/i);
  assert.match(english, /try again/i);
  withStoredLanguage('en', () => {
    assert.ok(getLocalizedApiError('ai_output_invalid', 503));
    for (const status of [200, 402, 409, 422]) {
      assert.equal(getLocalizedApiError('ai_output_invalid', status), null, `status ${status}`);
    }
  });
});

test('an operator refusal names the deployment mistake instead of "internal error"', () => {
  // Section 120: on a 5xx only the code crosses, so "migration 164 is not applied" and "the database
  // did not answer" both arrived as the generic sentence unless they carry distinct codes.
  for (const language of LANGUAGES) {
    for (const code of ['login_lockout_migration_missing', 'login_lockout_unavailable']) {
      const message = withStoredLanguage(language, () => getLocalizedApiError(code, 503));
      assert.ok(message && message.trim().length > 0, `${language} must translate ${code}`);
    }
  }
  const missing = withStoredLanguage('en', () => getLocalizedApiError('login_lockout_migration_missing', 503))!;
  assert.match(missing, /migration 164/i, 'the operator needs the migration number');
  assert.doesNotMatch(missing, /try again/i, 'a missing migration is not fixed by retrying');
  const unavailable = withStoredLanguage('en', () => getLocalizedApiError('login_lockout_unavailable', 503))!;
  assert.match(unavailable, /try again/i);
  assert.notEqual(missing, unavailable, 'two different causes must not share one sentence');
  withStoredLanguage('en', () => {
    for (const status of [200, 402, 409, 422]) {
      assert.equal(getLocalizedApiError('login_lockout_migration_missing', status), null, `status ${status}`);
    }
  });
});

test('an admin requeue refusal names the migration instead of "internal error"', () => {
  // Section 126. The exemption covering this site claimed the operator would read the migration number
  // in the message - impossible on a 5xx, which replaces its body with the generic sentence.
  for (const language of LANGUAGES) {
    const message = withStoredLanguage(language, () => getLocalizedApiError('email_requeue_migration_missing', 503));
    assert.ok(message && message.trim().length > 0, `${language} must translate email_requeue_migration_missing`);
  }
  const english = withStoredLanguage('en', () => getLocalizedApiError('email_requeue_migration_missing', 503))!;
  assert.match(english, /migration 165/i, 'the operator needs the migration number');
  assert.doesNotMatch(english, /try again in a minute/i, 'a missing migration is not fixed by waiting');
  withStoredLanguage('en', () => {
    for (const status of [200, 409, 422]) {
      assert.equal(getLocalizedApiError('email_requeue_migration_missing', status), null, `status ${status}`);
    }
  });
});
