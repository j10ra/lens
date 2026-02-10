import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function getAdminClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_SERVICE_KEY or VITE_SUPABASE_URL");
  return createClient(url, key);
}

export async function requireAdmin(accessToken: string) {
  if (!accessToken) throw new Error("Unauthorized");
  const supabase = getAdminClient();
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error || !user?.email) throw new Error("Unauthorized");
  if (!ADMIN_EMAILS.includes(user.email.toLowerCase())) throw new Error("Forbidden");
  return { userId: user.id, email: user.email };
}
