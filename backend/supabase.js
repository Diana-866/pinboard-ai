const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const fallbackKey = process.env.SUPABASE_ANON_KEY;

// Production relies on service_role to perform backend-only operations while
// RLS blocks direct client access. Do not silently start with the anon key:
// that creates a partially functioning deployment whose protected writes/RPCs
// fail only when a user reaches those code paths.
if (process.env.NODE_ENV === "production" && !serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required in production");
}
if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is required");
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey || fallbackKey
);

module.exports = supabase;
