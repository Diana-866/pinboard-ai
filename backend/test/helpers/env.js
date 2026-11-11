// Deterministic environment for unit tests.
// These are placeholders: no test in this suite talks to a real Supabase
// instance (the client is replaced by an in-memory double), but modules such as
// supabase.js validate the configuration when they are first required.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "test-anon-key";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-not-for-production";
module.exports = {};
