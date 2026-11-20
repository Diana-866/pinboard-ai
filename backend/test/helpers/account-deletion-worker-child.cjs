"use strict";

/**
 * Child process fixture for the account-deletion worker's standalone path.
 *
 * It is a separate file, not an inline `node -e`, because the defect it exists to catch is about the
 * event loop of a real process: the worker drained one batch and exited with code 0 while the
 * deletion queue kept growing. Only a real child can show that.
 *
 * The Supabase client is a double: the claim returns an empty, valid batch, so no account is
 * touched. Every claim is printed so the parent can count batches.
 *
 * The fixture stops itself. A child that has to be killed from the parent can outlive the test -
 * the first version of this fixture did exactly that and kept a whole suite run alive - so the
 * proof is "the loop is still polling at its own deadline", not "the parent managed to kill it".
 */

process.env.ACCOUNT_DELETION_WORKER_INTERVAL_MS = "5000";
const RUN_FOR_MS = 7_500;

const { runStandaloneWorker } = require("../../accountDeletionWorker");

let claims = 0;
const client = {
  supabaseUrl: "https://project.supabase.co",
  rpc: async () => {
    claims += 1;
    process.stdout.write(`claim ${claims}\n`);
    return { data: [], error: null };
  },
};

runStandaloneWorker({ client });

// The guard must not be what keeps this process alive: it is unreferenced, so it fires only while
// the worker is still holding the event loop open. A referenced guard here would mask the defect
// entirely - the first version of this fixture did exactly that and the mutation survived.
const guard = setTimeout(() => {
  process.stdout.write(`alive ${claims}\n`);
  process.exit(0);
}, RUN_FOR_MS);
if (typeof guard.unref === "function") guard.unref();

// Whatever happens, say when and why the process ended: an early exit is the defect.
process.on("exit", (code) => {
  process.stdout.write(`exited ${code} claims=${claims}\n`);
});
