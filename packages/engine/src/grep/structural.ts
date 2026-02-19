import { and, eq, or, sql } from "drizzle-orm";
import type { Db } from "../db/connection.js";
import { importQueries } from "../db/queries.js";
import { fileCochanges, fileImports, fileStats } from "../db/schema.js";

// ── Indegree query ─────────────────────────────────────────────────────────────

/**
 * Count incoming import edges per target file.
 * Returns Map<filePath, indegreeCount> for all files with at least one importer.
 */
export function getIndegrees(db: Db, repoId: string): Map<string, number> {
  const rows = db
    .select({
      target_path: fileImports.target_path,
      cnt: sql<number>`count(*)`.as("cnt"),
    })
    .from(fileImports)
    .where(eq(fileImports.repo_id, repoId))
    .groupBy(fileImports.target_path)
    .all();

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.target_path, Number(row.cnt));
  }
  return map;
}

// ── Reverse imports ────────────────────────────────────────────────────────────

/**
 * Return all source files that import the given target file.
 */
export function getReverseImports(db: Db, repoId: string, targetPath: string): string[] {
  return importQueries.getImporters(db, repoId, targetPath);
}

// ── Co-change partners ─────────────────────────────────────────────────────────

/**
 * Return top co-change partners for a file.
 * Co-change pairs are stored with lexicographic path ordering (path_a < path_b),
 * so we must query both directions.
 */
export function getCochangePartners(
  db: Db,
  repoId: string,
  filePath: string,
  limit = 10,
): Array<{ path: string; count: number }> {
  const rows = db
    .select()
    .from(fileCochanges)
    .where(
      and(
        eq(fileCochanges.repo_id, repoId),
        or(eq(fileCochanges.path_a, filePath), eq(fileCochanges.path_b, filePath)),
      ),
    )
    .orderBy(sql`${fileCochanges.cochange_count} DESC`)
    .limit(limit)
    .all();

  return rows.map((r) => ({
    // Return the OTHER path (the partner, not the queried file)
    path: r.path_a === filePath ? r.path_b : r.path_a,
    count: r.cochange_count,
  }));
}

// ── File stats ─────────────────────────────────────────────────────────────────

/**
 * Get commit stats for a file. Returns null if no stats recorded.
 */
export function getFileStats(
  db: Db,
  repoId: string,
  filePath: string,
): { commitCount: number; recentCount: number } | null {
  const row = db
    .select({
      commit_count: fileStats.commit_count,
      recent_count: fileStats.recent_count,
    })
    .from(fileStats)
    .where(and(eq(fileStats.repo_id, repoId), eq(fileStats.path, filePath)))
    .get();

  if (!row) return null;
  return { commitCount: row.commit_count, recentCount: row.recent_count };
}
