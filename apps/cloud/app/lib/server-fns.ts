import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
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

export const adminDeleteKeys = createServerFn({ method: "POST" })
  .inputValidator((input: { ids: string[] }) => input)
  .handler(async ({ data }) => {
    const db = getServerDb();
    await adminQueries.deleteKeys(db, data.ids);
    return { deleted: data.ids.length };
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

// --- Admin: Telemetry (raw SQL — table not in Drizzle schema) ---

export const adminGetTelemetryStats = createServerFn({ method: "GET" })
  .handler(async () => {
    const db = getServerDb();

    const [countsByType, uniqueInstalls, dailyCounts, recentEvents] = await Promise.all([
      db.execute<{ event_type: string; count: number }>(
        sql`SELECT event_type, count(*)::int AS count FROM telemetry_events GROUP BY event_type ORDER BY count DESC`
      ),
      db.execute<{ count: number }>(
        sql`SELECT count(DISTINCT telemetry_id)::int AS count FROM telemetry_events`
      ),
      db.execute<{ day: string; count: number }>(
        sql`SELECT date_trunc('day', created_at)::date::text AS day, count(*)::int AS count FROM telemetry_events WHERE created_at >= now() - interval '30 days' GROUP BY day ORDER BY day`
      ),
      db.execute<{
        id: string;
        telemetry_id: string;
        event_type: string;
        event_data: Record<string, string> | null;
        created_at: string;
      }>(
        sql`SELECT id, telemetry_id, event_type, event_data, created_at FROM telemetry_events ORDER BY created_at DESC LIMIT 100`
      ),
    ]);

    return {
      countsByType: [...countsByType],
      uniqueInstalls: countsByType.length > 0 ? ([...uniqueInstalls][0]?.count ?? 0) : 0,
      dailyCounts: [...dailyCounts],
      recentEvents: [...recentEvents],
    };
  });
