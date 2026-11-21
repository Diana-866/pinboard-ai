"use strict";

const { logFatalSync } = require("./safeLogger");

function installFatalProcessHandlers({
  processObject = process,
  writeFatal = logFatalSync,
  exit = (code) => process.exit(code),
} = {}) {
  let terminating = false;

  function terminate(event, reason) {
    if (terminating) return;
    terminating = true;
    try {
      writeFatal(event, reason);
    } catch {
      // A failed diagnostic write must never prevent fail-fast termination.
    }
    exit(1);
  }

  // Do not resume after a fatal exception or an unhandled rejection. Continuing
  // could leave the server/worker in an unknown state. The host should restart it.
  const onUncaughtException = (error) => terminate("process.uncaught_exception", error);
  const onUnhandledRejection = (error) => terminate("process.unhandled_rejection", error);
  processObject.on("uncaughtException", onUncaughtException);
  processObject.on("unhandledRejection", onUnhandledRejection);

  return () => {
    processObject.removeListener("uncaughtException", onUncaughtException);
    processObject.removeListener("unhandledRejection", onUnhandledRejection);
  };
}

module.exports = { installFatalProcessHandlers };
