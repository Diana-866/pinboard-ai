const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const backendDir = path.join(__dirname, "..");
const modulePath = path.join(backendDir, "supabase.js");

function loadSupabase(env) {
  return spawnSync(
    process.execPath,
    ["-e", `require(${JSON.stringify(modulePath)})`],
    {
      cwd: backendDir,
      encoding: "utf8",
      env: { ...process.env, ...env },
    }
  );
}

test("production startup fails clearly when the service-role key is missing", () => {
  const env = {
    NODE_ENV: "production",
    SUPABASE_URL: "https://example.supabase.co",
  };
  env.SUPABASE_SERVICE_ROLE_KEY = "";
  env.SUPABASE_ANON_KEY = "";

  const result = loadSupabase(env);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SUPABASE_SERVICE_ROLE_KEY is required/);
});

test("startup fails closed when NODE_ENV is unset or unfamiliar and no service-role key exists", () => {
  // An unset NODE_ENV is the realistic container/staging case; silently falling
  // back to the anon key would leave protected writes failing at runtime.
  for (const nodeEnv of ["", "staging", "prod"]) {
    const result = loadSupabase({
      NODE_ENV: nodeEnv,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_ANON_KEY: "test-anon-key",
    });
    assert.notEqual(result.status, 0, `NODE_ENV=${nodeEnv} must not start without a service-role key`);
    assert.match(result.stderr, /SUPABASE_SERVICE_ROLE_KEY is required/);
  }
});

test("local development and test may construct the client with the anon key", () => {
  for (const nodeEnv of ["development", "test"]) {
    const result = loadSupabase({
      NODE_ENV: nodeEnv,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_ANON_KEY: "test-anon-key",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
});

test("production startup accepts an explicitly configured service-role key", () => {
  const result = loadSupabase({
    NODE_ENV: "production",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    SUPABASE_ANON_KEY: "",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
