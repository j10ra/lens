// POST /index/maintain — background cron (every 5m)
// Re-indexes stale repos and backfills missing embeddings.

import { api } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import { db } from "../repo/db";
import { getHeadCommit } from "./lib/discovery";
import { ensureIndexed } from "./lib/ensure";
import { ensureEmbedded } from "./lib/embed";

interface MaintainResponse {
  processed: number;
  errors: number;
}

export const maintain = api(
  { expose: false, method: "POST", path: "/index/maintain" },
  async (): Promise<MaintainResponse> => {
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
      const locked = await db.queryRow<{ locked: boolean }>`
        SELECT pg_try_advisory_lock(hashtext(${repo.id})) AS locked
      `;
      if (!locked?.locked) continue;

      try {
        let isStale = false;
        try {
          const head = await getHeadCommit(repo.root_path);
          isStale = head !== repo.last_indexed_commit;
        } catch {
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

const _ = new CronJob("maintain-repos", {
  title: "Auto-index and embed stale repos",
  every: "5m",
  endpoint: maintain,
});
