"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
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
