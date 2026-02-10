import { createServerFn } from "@tanstack/react-start";
import { sql } from "drizzle-orm";
import { getServerDb } from "./db.server";
import { adminQueries, quotaQueries } from "@lens/cloud-db";
import { requireAdmin, getAdminClient } from "./admin-guard";

// --- Admin: Users ---

export const adminGetUsers = createServerFn({ method: "GET" })
  .inputValidator((input: { accessToken: string }) => input)
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    try {
      const supabase = getAdminClient();
      const { data: result, error } = await supabase.auth.admin.listUsers();
      if (error) {
        console.error("[adminGetUsers] listUsers error:", error);
        return { users: [] };
      }
      console.log("[adminGetUsers] found", result.users.length, "users");
      return {
        users: result.users.map((u: any) => ({
          id: u.id,
          email: u.email ?? "",
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
        })),
      };
    } catch (err) {
      console.error("[adminGetUsers] caught:", err);
      return { users: [] };
    }
  });

// --- Admin: API Keys ---

export const adminGetAllKeys = createServerFn({ method: "GET" })
  .inputValidator((input: { accessToken: string }) => input)
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const db = getServerDb();
    return adminQueries.allKeys(db);
  });

export const adminDeleteKeys = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; ids: string[] }) => input)
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const db = getServerDb();
    await adminQueries.deleteKeys(db, data.ids);
    return { deleted: data.ids.length };
  });

// --- Admin: Subscriptions ---

export const adminGetAllSubscriptions = createServerFn({ method: "GET" })
  .inputValidator((input: { accessToken: string }) => input)
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const db = getServerDb();
    return adminQueries.allSubscriptions(db);
  });

// --- Admin: Global Usage ---

export const adminGetGlobalUsage = createServerFn({ method: "GET" })
  .inputValidator((input: { accessToken: string; periodStart: string }) => input)
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const db = getServerDb();
    return adminQueries.globalUsageSummary(db, data.periodStart);
  });

// --- Admin: Telemetry ---

export const adminGetTelemetryStats = createServerFn({ method: "GET" })
  .inputValidator((input: { accessToken: string }) => input)
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const db = getServerDb();

    const [countsByType, uniqueInstalls, dailyCounts, recentEvents, perUser] = await Promise.all([
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
        user_id: string | null;
        created_at: string;
      }>(
        sql`SELECT id, telemetry_id, event_type, event_data, user_id, created_at FROM telemetry_events ORDER BY created_at DESC LIMIT 100`
      ),
      db.execute<{ user_id: string; event_type: string; count: number }>(
        sql`SELECT user_id, event_type, count(*)::int AS count FROM telemetry_events WHERE user_id IS NOT NULL GROUP BY user_id, event_type ORDER BY count DESC LIMIT 200`
      ),
    ]);

    return {
      countsByType: [...countsByType],
      uniqueInstalls: countsByType.length > 0 ? ([...uniqueInstalls][0]?.count ?? 0) : 0,
      dailyCounts: [...dailyCounts],
      recentEvents: [...recentEvents],
      perUser: [...perUser],
    };
  });

// --- Admin: Quotas ---

export const adminGetQuotas = createServerFn({ method: "GET" })
  .inputValidator((input: { accessToken: string }) => input)
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const db = getServerDb();
    return quotaQueries.getAll(db);
  });

export const adminUpdateQuota = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      accessToken: string;
      plan: string;
      values: Partial<{
        maxRepos: number;
        contextQueries: number;
        embeddingRequests: number;
        embeddingChunks: number;
        purposeRequests: number;
        reposIndexed: number;
      }>;
    }) => input,
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const db = getServerDb();
    return quotaQueries.update(db, data.plan, data.values);
  });
