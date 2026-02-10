import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { getServerDb } from "./db.server";
import { adminQueries } from "@lens/cloud-db";

// --- Admin: Users (Supabase Auth API — no Drizzle equivalent) ---

function getAdminClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_SERVICE_KEY or VITE_SUPABASE_URL");
  return createClient(url, key);
}

export const adminGetUsers = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const supabase = getAdminClient();
      const { data, error } = await supabase.auth.admin.listUsers();
      if (error) return { users: [] };
      return {
        users: data.users.map((u) => ({
          id: u.id,
          email: u.email ?? "",
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
        })),
      };
    } catch {
      return { users: [] };
    }
  });

// --- Admin: API Keys ---

export const adminGetAllKeys = createServerFn({ method: "GET" })
  .handler(async () => {
    const db = getServerDb();
    return adminQueries.allKeys(db);
  });

// --- Admin: Subscriptions ---

export const adminGetAllSubscriptions = createServerFn({ method: "GET" })
  .handler(async () => {
    const db = getServerDb();
    return adminQueries.allSubscriptions(db);
  });

// --- Admin: Global Usage ---

export const adminGetGlobalUsage = createServerFn({ method: "GET" })
  .inputValidator((input: { periodStart: string }) => input)
  .handler(async ({ data }) => {
    const db = getServerDb();
    return adminQueries.globalUsageSummary(db, data.periodStart);
  });
