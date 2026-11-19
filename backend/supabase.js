const { createClient } = require("@supabase/supabase-js");
const { buildTimedFetch, readSupabaseTimeoutMs } = require("./supabaseTimeout");

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const fallbackKey = process.env.SUPABASE_ANON_KEY;

// Only an explicit local environment may run without the service-role key.
// Any other deployment (including one where NODE_ENV was never set) must fail
// at startup: falling back to the anon key would start a partially functioning
// service whose protected writes and RPCs fail only when a user reaches them.
const isLocalEnv = ["development", "test"]
  .includes(String(process.env.NODE_ENV || "").trim().toLowerCase());
if (!isLocalEnv && !serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required outside local development or test");
}
if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is required");
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey || fallbackKey,
  {
    // Without this every database call can hang until the platform's TCP timeout, which is
    // far longer than any caller's own deadline.
    global: { fetch: buildTimedFetch(globalThis.fetch, readSupabaseTimeoutMs()) },
  }
);

module.exports = supabase;
