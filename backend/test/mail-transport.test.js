"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Transactional email is on the critical path: verification links, password resets, the
 * subscription-activated notice. Two defects were invisible without a test:
 *
 *  - the nodemailer transport was created without timeouts, so its defaults apply (a hung
 *    SMTP server can hold a socket for up to ten minutes while the client gave up long ago);
 *  - the "not configured" error named the deployment's environment variables, and that
 *    message reaches whoever triggered the path — including an anonymous sign-up.
 */

const mailPath = require.resolve("../mail");
delete require.cache[mailPath];
const mail = require("../mail");

function withEnv(overrides, run) {
  const saved = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    return run();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

const SMTP_ENV = {
  MAIL_SMTP_HOST: "smtp.example.com",
  MAIL_SMTP_USER: "user@example.com",
  MAIL_SMTP_PASS: "secret",
};

test("the transport always carries explicit timeouts", () => {
  const options = withEnv(SMTP_ENV, () => mail.buildTransactionalTransportOptions());

  for (const key of ["connectionTimeout", "greetingTimeout", "socketTimeout"]) {
    const value = options[key];
    assert.ok(Number.isInteger(value) && value > 0, `${key} must be a positive integer, got ${value}`);
  }
  // Bounded well below nodemailer's defaults and below any proxy idle timeout.
  assert.ok(options.connectionTimeout <= 15_000, "connecting must not hang for minutes");
  assert.ok(options.greetingTimeout <= 15_000, "the SMTP greeting must not hang for minutes");
  assert.ok(options.socketTimeout <= 60_000, "an idle socket must be dropped within a minute");
  assert.ok(options.socketTimeout > options.connectionTimeout, "the socket must outlive the handshake");
});

test("the transport keeps the TLS decision tied to the port", () => {
  const implicit = withEnv({ ...SMTP_ENV, MAIL_SMTP_PORT: "465" }, () => mail.buildTransactionalTransportOptions());
  assert.equal(implicit.secure, true);
  assert.equal(implicit.requireTLS, false);

  const starttls = withEnv({ ...SMTP_ENV, MAIL_SMTP_PORT: "587" }, () => mail.buildTransactionalTransportOptions());
  assert.equal(starttls.secure, false);
  assert.equal(starttls.requireTLS, true);
  assert.equal(starttls.port, 587);

  // No port configured means implicit TLS on 465, which must still be secure.
  const fallback = withEnv({ ...SMTP_ENV, MAIL_SMTP_PORT: undefined }, () => mail.buildTransactionalTransportOptions());
  assert.equal(fallback.port, 465);
  assert.equal(fallback.secure, true);
});

test("an unconfigured deployment does not tell the caller which variables are missing", async () => {
  const error = await withEnv(
    { MAIL_SMTP_HOST: undefined, MAIL_SMTP_USER: undefined, MAIL_SMTP_PASS: undefined },
    () => mail.sendMail({ to: "a@example.com", subject: "s", text: "t" }).then(
      () => null,
      (caught) => caught
    )
  );

  assert.ok(error, "sending without configuration must fail");
  assert.equal(error.httpStatus, 503);
  // The operator learns the cause from the log, the visitor from the message.
  assert.doesNotMatch(error.message, /MAIL_|SMTP|smtp_host|env|environment/i);
  assert.match(error.message, /временно недоступна|temporarily/i);
});

test("an unconfigured deployment does not fail closed for callers who tolerate it", async () => {
  const result = await withEnv(
    { MAIL_SMTP_HOST: undefined, MAIL_SMTP_USER: undefined, MAIL_SMTP_PASS: undefined },
    () => mail.sendMail({ to: "a@example.com", subject: "s", text: "t" }, { needThrow: false })
  );
  assert.deepEqual(result, { ok: false, skipped: true });
});

test("every sender builds its transport from a tested builder, never from an inline config", () => {
  const source = require("node:fs").readFileSync(require.resolve("../mail.js"), "utf8");
  const calls = [...source.matchAll(/createTransport\(([^)]*)\)/g)].map((match) => match[1]);
  assert.equal(calls.length, 2, "the transactional and the support-reply sender");
  for (const call of calls) {
    // An inline object literal would silently drop the timeouts again.
    assert.match(call, /^build(Transactional|Reply)TransportOptions\(/, `inline transport config: ${call}`);
  }
  // A thrown message must not name deployment variables, even though the file header
  // documents them for the operator.
  for (const match of source.matchAll(/httpError\([^)]*\)/g)) {
    assert.doesNotMatch(match[0], /MAIL_|SMTP_/, `a thrown error names deployment configuration: ${match[0]}`);
  }
});

test("the IMAP client is bounded too, so an inbox request cannot hang for minutes", () => {
  const options = withEnv({ MAIL_IMAP_HOST: "imap.example.com", MAIL_IMAP_PORT: undefined }, () =>
    mail.buildImapClientOptions()
  );
  for (const key of ["connectionTimeout", "greetingTimeout", "socketTimeout"]) {
    const value = options[key];
    assert.ok(Number.isInteger(value) && value > 0, `${key} must be a positive integer, got ${value}`);
  }
  // imapflow defaults to a five minute socket; the ceiling here is far lower.
  assert.ok(options.socketTimeout <= 120_000, "an idle IMAP socket must be dropped");
  assert.equal(options.host, "imap.example.com");
  assert.equal(options.port, 993);
  assert.equal(options.secure, true);

  const source = require("node:fs").readFileSync(require.resolve("../mail.js"), "utf8");
  const clients = [...source.matchAll(/new ImapFlow(([^;]*));/g)].map((match) => match[1].trim());
  assert.equal(clients.length, 2, "listing and reading a message");
  for (const call of clients) {
    assert.equal(call, "(buildImapClientOptions())", `inline IMAP options: ${call}`);
  }
});

test("the support-reply transport carries the same timeouts", () => {
  const options = mail.buildReplyTransportOptions({
    host: "smtp.example.com",
    port: 465,
    secure: true,
    requireTLS: false,
    auth: { user: "u", pass: "p" },
  });
  assert.ok(options.connectionTimeout > 0);
  assert.ok(options.greetingTimeout > 0);
  assert.ok(options.socketTimeout > 0);
  assert.equal(options.host, "smtp.example.com");
  assert.equal(options.secure, true);
});
