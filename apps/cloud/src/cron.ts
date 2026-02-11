import { sql } from "drizzle-orm";
import { getDb } from "./lib/db";

type Job = { name: string; interval: number; fn: () => Promise<void> };

const jobs: Job[] = [];

function register(name: string, interval: number, fn: () => Promise<void>) {
  jobs.push({ name, interval, fn });
}

export function startCron(databaseUrl: string) {
  const db = () => getDb(databaseUrl);

  // Keepalive — prevent Supabase free-tier pause
  register("keepalive", 12 * 60 * 60_000, async () => {
    await db().execute(sql`select 1`);
  });

  // --- add more jobs here ---
  // register("sync-usage", 30 * 60_000, async () => { ... });

  for (const job of jobs) {
    const run = () => job.fn().catch(() => {});
    run();
    setInterval(run, job.interval);
  }
}
