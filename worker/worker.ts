import { api } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import { db } from "../repo/db";
import { getHeadCommit } from "../index/discovery";
import { ensureIndexed } from "../index/ensure";
import { ensureEmbedded } from "../index/embed";

interface MaintainResponse {
  processed: number;
  errors: number;
}

export const maintain = api(
  { expose: false, method: "POST", path: "/worker/maintain" },
  async (): Promise<MaintainResponse> => {
    // Find repos that need work:
    // - Have unembedded chunks, OR
    // - Had trace activity in last 24h (likely still being used)
    const candidates: Array<{
      id: string;
      root_path: string;
      last_indexed_commit: string | null;
      unembedded: number;
    }> = [];

    const cursor = db.query<{
      id: string;
      root_path: string;
      last_indexed_commit: string | null;
      unembedded: number;
    }>`
      SELECT r.id, r.root_path, r.last_indexed_commit,
        (SELECT count(*)::int FROM chunks WHERE repo_id = r.id AND embedding IS NULL) AS unembedded
      FROM repos r
      WHERE r.last_indexed_commit IS NOT NULL
        AND (
          EXISTS (SELECT 1 FROM chunks WHERE repo_id = r.id AND embedding IS NULL)
          OR EXISTS (SELECT 1 FROM traces WHERE repo_id = r.id AND created_at > now() - interval '24 hours')
        )
    `;

    for await (const row of cursor) {
      candidates.push(row);
    }

    let processed = 0;
    let errors = 0;

    for (const repo of candidates) {
      // Advisory lock — prevent overlapping cron runs on same repo
      const locked = await db.queryRow<{ locked: boolean }>`
        SELECT pg_try_advisory_lock(hashtext(${repo.id})) AS locked
      `;
      if (!locked?.locked) continue;

      try {
        // Check if HEAD has advanced (requires filesystem)
        let isStale = false;
        try {
          const head = await getHeadCommit(repo.root_path);
          isStale = head !== repo.last_indexed_commit;
        } catch {
          // Repo dir may be gone — skip
          continue;
        }

        if (isStale) {
          await ensureIndexed(repo.id);
          await ensureEmbedded(repo.id);
        } else if (repo.unembedded > 0) {
          await ensureEmbedded(repo.id);
        }

        processed++;
      } catch {
        errors++;
      } finally {
        await db.exec`SELECT pg_advisory_unlock(hashtext(${repo.id}))`;
      }
    }

    return { processed, errors };
  },
);

// CronJob must be registered after the endpoint is declared
const _ = new CronJob("maintain-repos", {
  title: "Auto-index and embed stale repos",
  every: "5m",
  endpoint: maintain,
});
