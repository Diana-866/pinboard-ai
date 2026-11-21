"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const { installFatalProcessHandlers } = require("../fatalProcessHandlers");

test("fatal process handlers emit fixed events and exit with failure", () => {
  const processObject = new EventEmitter();
  const writes = [];
  const exits = [];
  const uninstall = installFatalProcessHandlers({
    processObject,
    writeFatal: (event) => writes.push(event),
    exit: (code) => exits.push(code),
  });
  try {
    processObject.emit("uncaughtException", new Error("password=must-not-leak"));
    processObject.emit("unhandledRejection", "token=must-not-leak");
    assert.deepEqual(writes, ["process.uncaught_exception"]);
    assert.deepEqual(exits, [1]);
    assert.equal(JSON.stringify(writes).includes("must-not-leak"), false);
  } finally {
    uninstall();
  }
});

test("fatal handler still exits if synchronous diagnostic output fails", () => {
  const processObject = new EventEmitter();
  const exits = [];
  const uninstall = installFatalProcessHandlers({
    processObject,
    writeFatal: () => { throw new Error("write failed"); },
    exit: (code) => exits.push(code),
  });
  try {
    processObject.emit("unhandledRejection", new Error("sensitive rejection"));
    assert.deepEqual(exits, [1]);
  } finally {
    uninstall();
  }
});

test("a fatal record names the whitelisted error code and never the message", () => {
  // Section 151. Раньше стартовый отказ печатал только {"level":"fatal","event":"..."} и владелец
  // не мог узнать причину. Теперь журнал несёт статический код отказа конфигурации - и по-прежнему
  // ни текста ошибки, ни стека.
  const { logFatalSync } = require("../safeLogger");
  const writeFileSync = fs.writeSync;
  const written = [];
  fs.writeSync = (_fd, text) => { written.push(String(text)); return String(text).length; };
  try {
    const error = new Error("SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi-must-not-leak");
    error.code = "config_supabase_service_role_missing";
    logFatalSync("process.uncaught_exception", error);
    const record = JSON.parse(written[0]);
    assert.equal(record.level, "fatal");
    assert.equal(record.event, "process.uncaught_exception");
    assert.equal(record.error_name, "Error");
    assert.equal(record.error_code, "config_supabase_service_role_missing");
    assert.equal(written.join("").includes("must-not-leak"), false);
  } finally {
    fs.writeSync = writeFileSync;
  }
});

test("an arbitrary error code is not written, only whitelisted ones", () => {
  const { logFatalSync } = require("../safeLogger");
  const writeFileSync = fs.writeSync;
  const written = [];
  fs.writeSync = (_fd, text) => { written.push(String(text)); return String(text).length; };
  try {
    const error = new Error("boom");
    error.code = "sk_live_51H8secret";
    logFatalSync("process.uncaught_exception", error);
    const record = JSON.parse(written[0]);
    assert.equal(record.error_code, undefined);
    assert.equal(written.join("").includes("sk_live"), false);
  } finally {
    fs.writeSync = writeFileSync;
  }
});

test("the handler hands the failure reason to the fatal writer", () => {
  // Без этого теста мутация «не передавать reason» выживала: logFatalSync проверялся в обход обработчика.
  const processObject = new EventEmitter();
  const calls = [];
  const uninstall = installFatalProcessHandlers({
    processObject,
    writeFatal: (...args) => calls.push(args),
    exit: () => {},
  });
  try {
    const error = new Error("x");
    error.code = "config_jwt_secret_missing";
    processObject.emit("uncaughtException", error);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "process.uncaught_exception");
    assert.equal(calls[0][1], error);
  } finally {
    uninstall();
  }
});
