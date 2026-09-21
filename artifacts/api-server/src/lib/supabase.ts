import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (
  process.env["SUPABASE_URL"] ||
  process.env["NEXT_PUBLIC_SUPABASE_URL"] ||
  process.env["VITE_SUPABASE_URL"]
)?.trim();

// Keep compatibility with the secret names currently configured in this Repl.
// The service-role key is never read by the browser bundle.
const serviceRoleKey =
  process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
  process.env["SUPABASE_SERVICE_ROLE"] ||
  process.env["serivice_role"] ||
  process.env["service_role"];

if (!supabaseUrl) {
  throw new Error("Supabase URL is not configured on the API server.");
}
if (!serviceRoleKey) {
  throw new Error("Supabase service-role secret is not configured on the API server.");
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
