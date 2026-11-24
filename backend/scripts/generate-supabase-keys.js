#!/usr/bin/env node
"use strict";

/**
 * Генерация ключей API self-hosted Supabase из одного JWT_SECRET.
 *
 * Запуск на сервере:
 *   node scripts/generate-supabase-keys.js "$JWT_SECRET"
 *
 * Печатает две строки, которые вписываются в deploy/supabase/kong.yml (замена заглушек)
 * и в deploy/.env бэкенда. Секрет не печатается и не сохраняется.
 */

const crypto = require("node:crypto");

function hs256(secret, payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

const secret = String(process.argv[2] || "").trim();
if (!secret || secret.length < 32) {
  console.error("usage: node generate-supabase-keys.js <JWT_SECRET (32+ characters)>");
  process.exit(2);
}

const tenYears = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 60 * 60;

console.log(`ANON_KEY=${hs256(secret, { role: "anon", iss: "supabase", iat: Math.floor(Date.now() / 1000), exp: tenYears })}`);
console.log(`SERVICE_ROLE_KEY=${hs256(secret, { role: "service_role", iss: "supabase", iat: Math.floor(Date.now() / 1000), exp: tenYears })}`);
