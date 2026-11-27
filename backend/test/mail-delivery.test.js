"use strict";

const test = require("node:test");
require("./helpers/env");
const assert = require("node:assert/strict");

/**
 * Delivery, not transport configuration.
 *
 * mail-transport.test.js already pins the timeout and TLS settings. What was never executed is the
 * part that actually sends: sendMail's success and failure paths, the support reply, and the admin
 * inbox (listInbox / fetchMessageBody). Email is how a customer receives the verification and reset
 * links, and the admin inbox is the only channel support has, so a silent failure here is a
 * customer who cannot get in and a support request nobody sees.
 */

const SMTP_ENV = {
  MAIL_SMTP_HOST: "smtp.example.invalid",
  MAIL_SMTP_USER: "robot@example.invalid",
  MAIL_SMTP_PASS: "unit-test-password",
  MAIL_FROM: "PinPosy <robot@example.invalid>",
  MAIL_IMAP_HOST: "imap.example.invalid",
  MAIL_IMAP_USER: "robot@example.invalid",
  MAIL_IMAP_PASS: "unit-test-password",
  MAIL_REPLY_SMTP_HOST: "smtp.example.invalid",
  MAIL_REPLY_SMTP_USER: "support@example.invalid",
  MAIL_REPLY_SMTP_PASS: "unit-test-password",
  MAIL_REPLY_FROM: "PinPosy Support <support@example.invalid>",
};

/** Loads mail.js with nodemailer and imapflow replaced by recording doubles. */
function loadMail({ smtpError = null, imap = {} } = {}) {
  const sent = [];
  const transports = [];
  const connections = [];

  const nodemailerPath = require.resolve("nodemailer");
  require.cache[nodemailerPath] = {
    id: nodemailerPath,
    filename: nodemailerPath,
    loaded: true,
    exports: {
      createTransport(options) {
        transports.push(options);
        return {
          async sendMail(message) {
            if (smtpError) throw smtpError;
            sent.push(message);
            return { messageId: message.messageId || "<generated@pinboard>" };
          },
        };
      },
    },
  };

  class FakeImapFlow {
    constructor(options) {
      this.options = options;
      // `exists: undefined` in the fixture means "the server gave no metadata", which is
      // different from an empty mailbox and must reach the counting fallback.
      this.mailbox = Object.prototype.hasOwnProperty.call(imap, "exists")
        ? { exists: imap.exists }
        : { exists: 0 };
      connections.push(this);
    }

    async connect() {
      if (imap.connectError) throw imap.connectError;
      this.connected = true;
    }

    async getMailboxLock() {
      this.locked = true;
      return { release: () => { this.released = true; } };
    }

    // An async generator, not a plain method: callers use `for await (...of client.fetch(...))`.
    async *fetch(range, fields, options) {
      this.fetchCalls = this.fetchCalls || [];
      this.fetchCalls.push({ range, fields, options });
      if (imap.fetchError) throw imap.fetchError;
      for (const entry of imap.messages || []) {
        yield { uid: entry.uid, envelope: entry.envelope, flags: new Set(entry.flags || []) };
      }
    }

    async fetchOne(uid) {
      this.fetchedUid = uid;
      return imap.one === undefined ? null : imap.one;
    }

    async logout() {
      this.loggedOut = true;
      if (imap.logoutError) throw imap.logoutError;
    }
  }

  const imapPath = require.resolve("imapflow");
  require.cache[imapPath] = {
    id: imapPath,
    filename: imapPath,
    loaded: true,
    exports: { ImapFlow: FakeImapFlow },
  };

  delete require.cache[require.resolve("../mail")];
  const mail = require("../mail");
  return { mail, sent, transports, connections };
}

function withEnv(overrides, run) {
  const saved = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test("sendMail delivers the message it was given and reports success", async () => {
  const { mail, sent, transports } = loadMail();
  const result = await withEnv(SMTP_ENV, () => mail.sendMail({
    to: "customer@example.invalid",
    subject: "PinPosy — verify your email",
    text: "Open this link",
    html: "<p>Open this link</p>",
    messageId: "<pinposy-1@pinposy.com>",
  }));

  assert.deepEqual(result, { ok: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "customer@example.invalid");
  assert.equal(sent[0].from, "PinPosy <robot@example.invalid>", "the configured sender is used");
  assert.equal(sent[0].html, "<p>Open this link</p>");
  assert.equal(sent[0].messageId, "<pinposy-1@pinposy.com>",
    "a stable message id is what lets a mail client treat a retry as the same email");
  assert.equal(transports.length, 1);
  assert.ok(transports[0].connectionTimeout > 0, "the transport keeps its bounded timeouts");
});


test("SMTP connection refusal falls back to Unisender Go HTTPS API", async () => {
  const smtpError = Object.assign(new Error("connection refused"), {
    code: "ECONNREFUSED",
    command: "CONN",
  });
  const { mail } = loadMail({ smtpError });
  let request;
  const httpApiClient = {
    async post(url, body, config) {
      request = { url, body, config };
      return { status: 200, data: { status: "success", job_id: "job-1" } };
    },
  };
  const env = {
    ...SMTP_ENV,
    MAIL_HTTP_API_KEY: "unit-http-api-key-123",
    MAIL_HTTP_API_URL: "https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json",
    MAIL_HTTP_API_FROM: undefined,
    MAIL_HTTP_API_IDEMPOTENCE_ENABLED: "true",
  };
  const result = await mail.sendMail({
    to: "customer@example.invalid",
    subject: "PinPosy verification",
    text: "Verify your account",
    html: "<p>Verify your account</p>",
    messageId: "<stable-message-id@pinposy.invalid>",
  }, { env, httpApiClient });

  assert.deepEqual(result, { ok: true });
  assert.equal(request.url, env.MAIL_HTTP_API_URL);
  assert.equal(request.config.headers["X-API-KEY"], env.MAIL_HTTP_API_KEY);
  assert.equal(request.body.message.recipients[0].email, "customer@example.invalid");
  assert.equal(request.body.message.from_email, "robot@example.invalid");
  assert.equal(request.body.message.from_name, "PinPosy");
  assert.equal(request.body.message.body.plaintext, "Verify your account");
  assert.equal(request.body.message.body.html, "<p>Verify your account</p>");
  assert.equal(request.body.message.idempotence_key.length, 64);
});

test("SMTP failure after the connection stage does not trigger a second delivery", async () => {
  const smtpError = Object.assign(new Error("temporary error during DATA"), {
    code: "ETIMEDOUT",
    command: "DATA",
  });
  const { mail } = loadMail({ smtpError });
  let httpCalls = 0;
  const httpApiClient = { async post() { httpCalls += 1; throw new Error("must not call HTTP fallback"); } };
  const env = { ...SMTP_ENV, MAIL_HTTP_API_KEY: "unit-http-api-key-123" };
  const error = await mail.sendMail({
    to: "customer@example.invalid",
    subject: "s",
    text: "t",
  }, { env, httpApiClient }).then(() => null, (caught) => caught);
  assert.equal(error.code, "ETIMEDOUT");
  assert.equal(httpCalls, 0, "ambiguous SMTP delivery must not be duplicated");
});

test("HTTPS API can deliver when SMTP is not configured", async () => {
  const { mail } = loadMail();
  let calls = 0;
  let requestBody;
  const httpApiClient = {
    async post(_url, body) {
      calls += 1;
      requestBody = body;
      return { status: 200, data: { status: "success", job_id: "job-2" } };
    },
  };
  const env = {
    MAIL_SMTP_HOST: "",
    MAIL_SMTP_USER: "",
    MAIL_SMTP_PASS: "",
    MAIL_FROM: "PinPosy <robot@example.invalid>",
    MAIL_HTTP_API_KEY: "unit-http-api-key-123",
    MAIL_HTTP_API_URL: "https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json",
  };
  const result = await mail.sendMail({
    to: "customer@example.invalid",
    subject: "s",
    text: "t",
  }, { env, httpApiClient });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 1);
  assert.equal(requestBody.message.idempotence_key, undefined, "idempotence is opt-in until the provider enables it");
});

test("HTTPS mail fallback refuses an untrusted or plain HTTP endpoint", async () => {
  const smtpError = Object.assign(new Error("connection refused"), {
    code: "ECONNREFUSED",
    command: "CONN",
  });
  const { mail } = loadMail({ smtpError });
  let calls = 0;
  const httpApiClient = {
    async post() { calls += 1; return { status: 200, data: { status: "success" } }; },
  };
  const env = {
    ...SMTP_ENV,
    MAIL_HTTP_API_KEY: "unit-http-api-key-123",
    MAIL_HTTP_API_URL: "http://127.0.0.1:3000/send",
  };
  const error = await mail.sendMail({
    to: "customer@example.invalid",
    subject: "s",
    text: "t",
  }, { env, httpApiClient }).then(() => null, (caught) => caught);
  assert.equal(error.httpStatus, 503);
  assert.equal(calls, 0);
});

test("an optional body part is omitted rather than sent as undefined", async () => {
  const { mail, sent } = loadMail();
  await withEnv(SMTP_ENV, () => mail.sendMail({ to: "a@example.invalid", subject: "s", text: "t" }));
  assert.equal("html" in sent[0], false);
  assert.equal("messageId" in sent[0], false);
});

test("a transport failure is rethrown by default and reported when the caller tolerates it", async () => {
  const { mail } = loadMail({ smtpError: Object.assign(new Error("550 mailbox unavailable"), { code: "EENVELOPE" }) });

  const thrown = await withEnv(SMTP_ENV, () => mail.sendMail({ to: "a@example.invalid", subject: "s", text: "t" })
    .then(() => null, (error) => error));
  assert.ok(thrown instanceof Error);
  assert.match(thrown.message, /550/, "the caller sees the provider's own reason");

  const tolerated = await withEnv(SMTP_ENV, () => mail.sendMail(
    { to: "a@example.invalid", subject: "s", text: "t" },
    { needThrow: false }
  ));
  assert.equal(tolerated.ok, false);
  assert.match(tolerated.error, /550/);
});

test("the support reply is threaded as a reply, not as a new conversation", async () => {
  const { mail, sent } = loadMail();

  await withEnv(SMTP_ENV, () => mail.replyToMessage("customer@example.invalid", "Refund request", "We are on it."));
  assert.equal(sent[0].subject, "Re: Refund request");
  assert.equal(sent[0].from, "PinPosy Support <support@example.invalid>", "the reply uses the support sender");

  // An already-prefixed subject must not be prefixed twice, whatever the case the customer's
  // mail client used.
  for (const subject of ["Re: Refund request", "RE: Refund request", "re: Refund request"]) {
    await withEnv(SMTP_ENV, () => mail.replyToMessage("customer@example.invalid", subject, "Answer"));
    assert.equal(sent[sent.length - 1].subject, "Re: Refund request", `${subject} must not be prefixed twice`);
  }
});

test("reply refuses without configuration instead of pretending to send", async () => {
  const { mail, sent } = loadMail();
  const error = await withEnv({ MAIL_REPLY_SMTP_HOST: undefined, MAIL_REPLY_SMTP_USER: undefined, MAIL_REPLY_SMTP_PASS: undefined, MAIL_USER: undefined, MAIL_PASS: undefined },
    () => mail.replyToMessage("customer@example.invalid", "s", "t").then(() => null, (caught) => caught));

  assert.ok(error, "an unconfigured reply must fail");
  assert.equal(error.httpStatus, 503);
  assert.equal(sent.length, 0, "nothing may be sent");
});

test("the inbox returns the newest messages, newest first, and releases the mailbox", async () => {
  const { mail, connections } = loadMail({
    imap: {
      exists: 3,
      messages: [
        { uid: 10, envelope: { from: [{ name: "Ann", address: "ann@example.invalid" }], subject: "First", date: new Date("2026-01-01"), }, flags: ["\\Seen"] },
        { uid: 11, envelope: { from: [{ address: "bob@example.invalid" }], subject: null, date: new Date("2026-01-02") }, flags: [] },
      ],
    },
  });

  const messages = await withEnv(SMTP_ENV, () => mail.listInbox(2));
  assert.equal(messages.length, 2);
  assert.deepEqual(messages.map((entry) => entry.uid), [11, 10], "the newest message comes first");
  assert.equal(messages[0].subject, "(без темы)", "a message without a subject still renders");
  // A contact without a display name renders as the bare address, never as " <address>".
  assert.equal(messages[0].from, "bob@example.invalid");
  assert.equal(messages[1].from, "Ann <ann@example.invalid>");
  assert.equal(messages[1].seen, true);
  assert.equal(messages[0].seen, false);

  const connection = connections[0];
  assert.equal(connection.released, true, "the mailbox lock must be released");
  assert.equal(connection.loggedOut, true, "the connection must be closed");
  assert.equal(connection.fetchCalls[0].range.seq, "2:*", "only the last page is fetched");
});

test("an empty inbox answers an empty list instead of asking for a range that does not exist", async () => {
  // IMAP has no message 0, so a mailbox with exists = 0 makes the sequence range 1:* invalid and
  // some servers answer it with an error. The admin inbox page must show "no messages", not a 500.
  const { mail, connections } = loadMail({ imap: { exists: 0, messages: [] } });
  const messages = await withEnv(SMTP_ENV, () => mail.listInbox());
  assert.deepEqual(messages, []);
  assert.equal(connections[0].fetchCalls, undefined, "no fetch may be issued for an empty mailbox");
});

test("a mailbox that reports no metadata falls back to counting before paging", async () => {
  const { mail, connections } = loadMail({
    imap: { exists: undefined, messages: [{ uid: 5, envelope: { subject: "Only" }, flags: [] }] },
  });
  // exists is not a number: the code must count with a full fetch, then page.
  const messages = await withEnv(SMTP_ENV, () => mail.listInbox(10));
  assert.equal(messages.length, 1);
  assert.equal(connections[0].fetchCalls.length, 2, "one counting pass, then one paged pass");
  assert.deepEqual(connections[0].fetchCalls[0].range, { all: true });
});

test("a failing fetch still closes the connection so the next request is not blocked", async () => {
  const { mail, connections } = loadMail({ imap: { exists: 2, fetchError: new Error("IMAP connection lost") } });
  await assert.rejects(() => withEnv(SMTP_ENV, () => mail.listInbox()), /IMAP connection lost/);
  assert.equal(connections[0].released, true);
  assert.equal(connections[0].loggedOut, true);
});

test("message body reading returns text parts, bounds the size and reports a missing message", async () => {
  const longText = "x".repeat(20_000);
  const { mail } = loadMail({
    imap: {
      exists: 1,
      one: {
        bodyStructure: {
          childNodes: [
            { type: "text", encoding: "quoted-printable", source: Buffer.from("plain body") },
            { type: "text", encoding: "base64", source: Buffer.from("must not appear") },
          ],
        },
      },
    },
  });

  const body = await withEnv(SMTP_ENV, () => mail.fetchMessageBody("12"));
  assert.equal(body.uid, 12);
  assert.match(body.body, /plain body/);
  assert.doesNotMatch(body.body, /must not appear/, "base64 parts are not dumped raw into the UI");

  const longMail = loadMail({
    imap: { exists: 1, one: { bodyStructure: { type: "text", source: Buffer.from(longText) } } },
  });
  const bounded = await withEnv(SMTP_ENV, () => longMail.mail.fetchMessageBody(7));
  assert.equal(bounded.body.length, 8000, "an enormous body must not be shipped to the admin UI");

  const empty = loadMail({ imap: { exists: 1, one: null } });
  const missing = await withEnv(SMTP_ENV, () => empty.mail.fetchMessageBody(9).then(() => null, (error) => error));
  assert.equal(missing.httpStatus, 404);
});

test("an invalid UID is refused before any connection is opened", async () => {
  const { mail, connections } = loadMail({ imap: { exists: 1 } });
  for (const uid of ["0", "-1", "1.5", "abc", "", null]) {
    await assert.rejects(() => withEnv(SMTP_ENV, () => mail.fetchMessageBody(uid)),
      (error) => error.httpStatus === 422, `uid ${JSON.stringify(uid)} must be refused`);
  }
  assert.equal(connections.length, 0, "validation happens before IMAP is touched");
});

test("an unconfigured mailbox answers 503 for both admin reads", async () => {
  const { mail, connections } = loadMail({ imap: { exists: 1 } });
  const env = { MAIL_IMAP_HOST: undefined, MAIL_IMAP_USER: undefined, MAIL_IMAP_PASS: undefined, MAIL_USER: undefined, MAIL_PASS: undefined };
  for (const call of [() => mail.listInbox(), () => mail.fetchMessageBody(1)]) {
    const error = await withEnv(env, () => call().then(() => null, (caught) => caught));
    assert.equal(error.httpStatus, 503);
  }
  assert.equal(connections.length, 0);
});
