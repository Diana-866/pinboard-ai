// Локальная проверка сценария «регистрация → письмо → клик → вход»
// с подменёнными Supabase (in-memory) и nodemailer (письма не уходят в сеть).
// Запуск: node test/e2e-email-verify.js
const path = require("path");
const Module = require("module");

const BACKEND = path.join(__dirname, "..", "backend");

// ---------------------------------------------------------------- mock nodemailer
const sentMails = [];
const nodemailerId = require.resolve("nodemailer", { paths: [BACKEND] });
const fakeNodemailer = {
  createTransport: () => ({
    sendMail: async (opts) => {
      sentMails.push(opts);
      return { messageId: `<${sentMails.length}@pinposy.test>` };
    },
  }),
};
require.cache[nodemailerId] = { id: nodemailerId, filename: nodemailerId, loaded: true, exports: fakeNodemailer };

// ---------------------------------------------------------------- mock supabase
const db = { users: [], auth_tokens: [] };
let seq = 0;
const rid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

function makeQuery(table) {
  const q = { filters: [], ordering: null, lim: null, op: "select", payload: null, cols: "*" };
  const api = {
    select(cols) { if (q.op !== "insert") q.op = "select"; q.cols = cols || "*"; return api; },
    insert(payload) { q.op = "insert"; q.payload = payload; return api; },
    update(payload) { q.op = "update"; q.payload = payload; return api; },
    eq(k, v) { q.filters.push([k, v]); return api; },
    is(k, v) { q.filters.push([k, v]); return api; },
    order(k, o) { q.ordering = { k, asc: (o && o.ascending) !== false }; return api; },
    limit(n) { q.lim = n; return api; },
    async maybeSingle() { const r = await exec(); return { data: Array.isArray(r.data) ? (r.data[0] || null) : (r.data || null), error: r.error }; },
    async single() { const r = await exec(); const one = Array.isArray(r.data) ? (r.data[0] || null) : r.data; return { data: one, error: one ? null : { message: "no rows" } }; },
    then(resolve) { return exec().then(resolve); },
  };

  async function exec() {
    const rows = db[table];
    const match = (r) => q.filters.every(([k, v]) => (v === null ? r[k] == null : String(r[k]) === String(v)));

    if (q.op === "insert") {
      const row = { id: rid(), created_at: new Date().toISOString(), used_at: null, ...q.payload };
      if (table === "auth_tokens" && rows.some((r) => r.token_hash === row.token_hash)) {
        return { data: null, error: { message: "duplicate key value violates unique constraint" } };
      }
      if (table === "users") row.email_verified = row.email_verified ?? false;
      rows.push(row);
      return { data: row, error: null };
    }
    if (q.op === "update") {
      const hit = rows.filter(match);
      hit.forEach((r) => Object.assign(r, q.payload));
      return { data: hit, error: null };
    }
    let out = rows.filter(match);
    if (q.ordering) {
      const { k, asc } = q.ordering;
      out = [...out].sort((a, b) => (new Date(a[k]) - new Date(b[k])) * (asc ? 1 : -1));
    }
    if (q.lim) out = out.slice(0, q.lim);
    return { data: out, error: null };
  }

  return api;
}

const supabasePath = path.join(BACKEND, "supabase.js");
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: {
    from: (t) => makeQuery(t),
    rpc: async (name, args) => {
      if (name === "issue_password_reset_token") {
        const user = db.users.find((row) => String(row.id) === String(args.p_user_id));
        if (!user || new Date(args.p_expires_at).getTime() <= Date.now()) return { data: false, error: null };
        db.auth_tokens
          .filter((row) => String(row.user_id) === String(args.p_user_id) && row.purpose === "password_reset" && !row.used_at)
          .forEach((row) => { row.used_at = new Date().toISOString(); });
        db.auth_tokens.push({
          id: rid(), user_id: String(args.p_user_id), token_hash: args.p_token_hash,
          purpose: "password_reset", expires_at: args.p_expires_at,
          used_at: null, created_at: new Date().toISOString(),
        });
        return { data: true, error: null };
      }
      if (name === "consume_password_reset_token") {
        const token = db.auth_tokens.find((row) =>
          row.token_hash === args.p_token_hash && row.purpose === "password_reset" &&
          !row.used_at && new Date(row.expires_at).getTime() > Date.now()
        );
        if (!token) return { data: false, error: null };
        const user = db.users.find((row) => String(row.id) === String(token.user_id));
        if (!user) return { data: false, error: null };
        user.password_hash = args.p_password_hash;
        token.used_at = new Date().toISOString();
        return { data: true, error: null };
      }
      if (name === "consume_email_verification_token") {
        const token = db.auth_tokens.find((row) =>
          row.token_hash === args.p_token_hash && row.purpose === "email_verify"
        );
        if (!token) return { data: false, error: null };
        const user = db.users.find((row) => String(row.id) === String(token.user_id));
        if (!user) return { data: false, error: null };
        if (token.used_at) return { data: user.email_verified === true, error: null };
        if (new Date(token.expires_at).getTime() <= Date.now()) return { data: false, error: null };
        user.email_verified = true;
        token.used_at = new Date().toISOString();
        return { data: true, error: null };
      }
      return { data: null, error: { message: "unknown RPC" } };
    },
  },
};

// ---------------------------------------------------------------- env
process.env.JWT_SECRET = "test-secret";
process.env.MAIL_SMTP_HOST = "smtp.go1.unisender.ru";
process.env.MAIL_SMTP_PORT = "465";
process.env.MAIL_SMTP_USER = "unisender-test-user";
process.env.MAIL_SMTP_PASS = "unisender-test-api-key";
process.env.MAIL_FROM = "PinPosy <support@pinposy.com>";
process.env.FRONTEND_URL = "https://pinposy.com";

const auth = require(path.join(BACKEND, "auth.js"));
const emailVerify = require(path.join(BACKEND, "email-verify.js"));
const passwordReset = require(path.join(BACKEND, "password-reset.js"));

let pass = 0;
let fail = 0;
function ok(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}${extra ? " — " + extra : ""}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`);
  }
}
function tokenFromMail(mail) {
  const m = /token=([A-Za-z0-9_-]+)/.exec(mail.text);
  return m ? m[1] : null;
}

(async () => {
  console.log("\n1) Регистрация");
  const reg = await auth.register("user@example.com", "superpass123", "Анна", "Иванова");
  ok("ответ без JWT", !reg.token && reg.needVerification === true, `token=${reg.token}`);
  ok("письмо отправлено", sentMails.length === 1, `получатель: ${sentMails[0]?.to}`);
  ok("это письмо подтверждения", /подтвердите email/i.test(sentMails[0].subject), sentMails[0].subject);
  const tok1 = tokenFromMail(sentMails[0]);
  ok("ссылка ведёт на фронт /verify-email", sentMails[0].text.includes("https://pinposy.com/verify-email?token="), tok1 ? tok1.slice(0, 10) + "…" : "нет токена");
  ok("в БД только sha256-хэш", db.auth_tokens[0].token_hash === emailVerify.sha256(tok1) && !JSON.stringify(db.auth_tokens).includes(tok1));
  ok("purpose=email_verify", db.auth_tokens[0].purpose === "email_verify");
  const ttlH = (new Date(db.auth_tokens[0].expires_at) - Date.now()) / 3600000;
  ok("TTL ≈ 24 часа", ttlH > 23.9 && ttlH <= 24.01, ttlH.toFixed(2) + " ч");
  ok("users.email_verified=false", db.users[0].email_verified === false);

  console.log("\n2) Вход без подтверждения — запрещён (403)");
  let e1;
  try { await auth.login("user@example.com", "superpass123"); } catch (e) { e1 = e; }
  ok("403", e1 && e1.httpStatus === 403, e1 && e1.message);
  ok("текст из ТЗ", e1 && e1.message === auth.MSG_NEED_VERIFY, e1 && e1.message);
  ok("code=email_not_verified", e1 && e1.details.code === "email_not_verified");
  ok("JWT не выдан", !e1.token);

  console.log("\n3) Троттлинг 5 минут при повторном входе");
  const before = sentMails.length;
  let e2;
  try { await auth.login("user@example.com", "superpass123"); } catch (e) { e2 = e; }
  ok("второе письмо НЕ отправлено", sentMails.length === before, `писем: ${sentMails.length}`);
  ok("emailSent=false + retryAfterSeconds", e2.details.emailSent === false && e2.details.retryAfterSeconds > 0, `${e2.details.retryAfterSeconds} c`);

  console.log("\n4) Неверный пароль на неподтверждённом аккаунте → 401 (не 403)");
  let e3;
  try { await auth.login("user@example.com", "wrongpassword"); } catch (e) { e3 = e; }
  ok("401, существование аккаунта не раскрыто", e3 && e3.httpStatus === 401, e3 && e3.message);

  console.log("\n5) Переход по ссылке из письма");
  // Вход переслал письмо, поэтому живёт только последняя ссылка (старые погашены)
  const tokFresh = tokenFromMail(sentMails[sentMails.length - 1]);
  ok("живая ссылка — из последнего письма (повторно не слали: троттлинг)", tokFresh === tok1);
  const v = await emailVerify.applyVerification(tokFresh);
  ok("токен применён", v.ok === true);
  ok("users.email_verified=true в БД", db.users[0].email_verified === true);
  ok("токен помечен used_at", !!db.auth_tokens[0].used_at);

  console.log("\n6) Вход после подтверждения");
  const li = await auth.login("user@example.com", "superpass123");
  ok("JWT выдан", !!li.token && li.token.split(".").length === 3);
  ok("user.email_verified=true", li.user.email_verified === true);
  ok("payload JWT распознан", auth.verifyToken(li.token).userId === db.users[0].id);

  console.log("\n7) Одноразовость ссылки");
  const again = await emailVerify.applyVerification(tokFresh);
  ok("повторный клик не ломает подтверждение", again.ok === true && again.already === true);

  console.log("\n8) Просроченный токен");
  const old = "expired-token-value";
  db.auth_tokens.push({ id: rid(), user_id: db.users[0].id, token_hash: emailVerify.sha256(old), purpose: "email_verify", expires_at: new Date(Date.now() - 1000).toISOString(), used_at: null, created_at: new Date(Date.now() - 90000000).toISOString() });
  let e4;
  try { await emailVerify.applyVerification(old); } catch (e) { e4 = e; }
  ok("422 для просроченного", e4 && e4.httpStatus === 422, e4 && e4.message);

  console.log("\n9) Подделка / чужой purpose");
  let e5;
  try { await emailVerify.applyVerification("made-up-token"); } catch (e) { e5 = e; }
  ok("422 для выдуманного токена", e5 && e5.httpStatus === 422);
  const resetTok = "reset-purpose-token";
  db.auth_tokens.push({ id: rid(), user_id: db.users[0].id, token_hash: emailVerify.sha256(resetTok), purpose: "password_reset", expires_at: new Date(Date.now() + 3600000).toISOString(), used_at: null, created_at: new Date().toISOString() });
  let e6;
  try { await emailVerify.applyVerification(resetTok); } catch (e) { e6 = e; }
  ok("токен сброса пароля не подходит для подтверждения email", e6 && e6.httpStatus === 422);

  console.log("\n10) Повторная отправка из кабинета (Authorization) + гашение старых ссылок");
  const reg3 = await auth.register("third@example.com", "superpass789");
  const u3 = db.users.find((u) => u.email === "third@example.com");
  ok("третий аккаунт не подтверждён", reg3.ok === true && u3.email_verified === false);
  const firstTok3 = tokenFromMail(sentMails[sentMails.length - 1]);
  // «прошло 6 минут» — отодвигаем created_at, иначе троттлинг справедливо заблокирует отправку
  db.auth_tokens
    .filter((r) => r.user_id === u3.id && r.purpose === "email_verify")
    .forEach((r) => { r.created_at = new Date(Date.now() - 6 * 60000).toISOString(); });
  const mailsBefore = sentMails.length;
  const r1 = await emailVerify.resendVerification(null, u3.id);
  ok("письмо ушло", r1.sent === true && sentMails.length === mailsBefore + 1, r1.message);
  const live3 = db.auth_tokens.filter((r) => r.user_id === u3.id && r.purpose === "email_verify" && !r.used_at);
  ok("активна ровно одна ссылка (старая погашена)", live3.length === 1, `активных: ${live3.length}`);
  const old3 = db.auth_tokens.find((r) => r.token_hash === emailVerify.sha256(firstTok3));
  ok("старый токен помечен used_at", !!old3.used_at);
  let e7;
  try { await emailVerify.applyVerification(firstTok3); } catch (e) { e7 = e; }
  ok("старая ссылка больше не работает (422)", e7 && e7.httpStatus === 422);
  const r2 = await emailVerify.resendVerification(null, u3.id);
  ok("сразу второй раз — троттлинг", r2.throttled === true, r2.message);
  const newTok3 = tokenFromMail(sentMails[sentMails.length - 1]);
  const v3 = await emailVerify.applyVerification(newTok3);
  ok("новая ссылка подтверждает email", v3.ok === true && db.users.find((u) => u.id === u3.id).email_verified === true);
  const r3 = await emailVerify.resendVerification(null, u3.id);
  ok("для подтверждённого — alreadyVerified", r3.alreadyVerified === true, r3.message);

  console.log("\n11) Второй пользователь + анонимный resend не раскрывает email");
  const reg2 = await auth.register("second@example.com", "superpass456");
  ok("второй аккаунт создан", reg2.ok === true);
  const anonKnown = await emailVerify.resendVerification("second@example.com");
  const anonUnknown = await emailVerify.resendVerification("nobody@example.com");
  ok("ответы идентичны", anonKnown.message === anonUnknown.message, anonKnown.message);

  console.log("\n12) Email-флаг отсутствует (миграция не применена) — вход не ломается");
  delete db.users[0].email_verified;
  const legacy = await auth.login("user@example.com", "superpass123");
  ok("legacy-аккаунт входит", !!legacy.token);

  console.log("\n13) Сброс пароля использует отдельный транзакционный SMTP");
  const beforeReset = sentMails.length;
  const resetKnown = await passwordReset.requestReset("user@example.com", "https://attacker.example", "ru");
  ok("запрос известного адреса отвечает общим сообщением", resetKnown.ok === true);
  ok("письмо восстановления отправлено", sentMails.length === beforeReset + 1);
  const resetMail = sentMails[sentMails.length - 1];
  ok("ссылка строится из FRONTEND_URL, а не из тела запроса",
    resetMail.text.includes("https://pinposy.com/reset-password?token=") && !resetMail.text.includes("attacker.example"));
  ok("письмо использует транзакционный SMTP sender", resetMail.from === "PinPosy <support@pinposy.com>");
  const resetToken = tokenFromMail(resetMail);
  const resetRow = db.auth_tokens.find((row) => row.token_hash === require("crypto").createHash("sha256").update(resetToken).digest("hex"));
  ok("в БД хранится только хэш reset-токена", !!resetRow && !JSON.stringify(db.auth_tokens).includes(resetToken));
  const unknownBefore = sentMails.length;
  const resetUnknown = await passwordReset.requestReset("nobody@example.com", null, "en");
  ok("ответы известного и неизвестного адресов одинаковы",
    resetKnown.message === resetUnknown.message && resetUnknown.ok === true);
  ok("для неизвестного адреса письмо не отправлено", sentMails.length === unknownBefore);
  console.log("\n14) Одноразовое применение reset-токена");
  const oldHash = db.users[0].password_hash;
  const concurrent = await Promise.allSettled([
    passwordReset.applyReset(resetToken, "ExamplePass123!"),
    passwordReset.applyReset(resetToken, "AnotherPass456!"),
  ]);
  const succeeded = concurrent.filter((item) => item.status === "fulfilled").length;
  const rejected = concurrent.filter((item) => item.status === "rejected").length;
  ok("только один параллельный запрос успешен", succeeded === 1 && rejected === 1);
  ok("хэш учётных данных обновлён", db.users[0].password_hash !== oldHash);
  ok("токен отмечен использованным", !!resetRow.used_at);
  let reuseError;
  try { await passwordReset.applyReset(resetToken, "ThirdPass789!"); } catch (e) { reuseError = e; }
  ok("повторное применение отклоняется с 422", reuseError && reuseError.httpStatus === 422);

  console.log(`\nИТОГО: ${pass} прошло, ${fail} провалено\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("КРАШ ТЕСТА:", e);
  process.exit(1);
});
