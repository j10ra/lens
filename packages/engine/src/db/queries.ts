import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import type { Db } from "./connection";
import {
  chunks,
  fileCochanges,
  fileImports,
  fileMetadata,
  fileStats,
  repos,
  requestLogs,
  settings,
  telemetryEvents,
  usageCounters,
} from "./schema";

// --- Helpers ---

function jsonParse<T>(val: unknown, fallback: T): T {
  if (val == null) return fallback;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  return val as T;
}

export function toEmbeddingBlob(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

export function fromEmbeddingBlob(blob: Buffer | Uint8Array | null): Float32Array | null {
  if (!blob || blob.length === 0) return null;
  const buf = blob instanceof Buffer ? blob : Buffer.from(blob);
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

// --- Repo Queries ---

export const repoQueries = {
  upsert(
    db: Db,
    identityKey: string,
    name: string,
    rootPath: string,
    remoteUrl: string | null,
  ): { id: string; created: boolean } {
    // Check existing by root_path first
    const existing = db.select({ id: repos.id }).from(repos).where(eq(repos.root_path, rootPath)).get();
    if (existing) {
      db.update(repos)
        .set({
          identity_key: identityKey,
          name,
          remote_url: remoteUrl ?? undefined,
          updated_at: sql`datetime('now')`,
        })
        .where(eq(repos.id, existing.id))
        .run();
      return { id: existing.id, created: false };
    }
    // Check by identity_key
    const byKey = db.select({ id: repos.id }).from(repos).where(eq(repos.identity_key, identityKey)).get();
    if (byKey) {
      db.update(repos)
        .set({
          root_path: rootPath,
          remote_url: remoteUrl ?? undefined,
          updated_at: sql`datetime('now')`,
        })
        .where(eq(repos.id, byKey.id))
        .run();
      return { id: byKey.id, created: false };
    }
    const id = randomUUID();
    db.insert(repos)
      .values({
        id,
        identity_key: identityKey,
        name,
        root_path: rootPath,
        remote_url: remoteUrl,
      })
      .run();
    return { id, created: true };
  },

  getById(db: Db, id: string) {
    return db.select().from(repos).where(eq(repos.id, id)).get() ?? null;
  },

  getByPath(db: Db, rootPath: string) {
    return db.select().from(repos).where(eq(repos.root_path, rootPath)).get() ?? null;
  },

  list(db: Db) {
    return db.select().from(repos).orderBy(sql`created_at DESC`).all();
  },

  updateIndexState(db: Db, id: string, commit: string, status: string): void {
    db.update(repos)
      .set({
        last_indexed_commit: commit,
        index_status: status,
        last_indexed_at: sql`datetime('now')`,
        updated_at: sql`datetime('now')`,
      })
      .where(eq(repos.id, id))
      .run();
  },

  updateMaxDepth(db: Db, id: string, depth: number): void {
    db.update(repos).set({ max_import_depth: depth }).where(eq(repos.id, id)).run();
  },

  updateVocabClusters(db: Db, id: string, clusters: unknown, commit?: string): void {
    const set: Record<string, unknown> = { vocab_clusters: JSON.stringify(clusters) };
    if (commit) set.last_vocab_cluster_commit = commit;
    db.update(repos).set(set).where(eq(repos.id, id)).run();
  },

  updateGitAnalysisCommit(db: Db, id: string, commit: string): void {
    db.update(repos).set({ last_git_analysis_commit: commit }).where(eq(repos.id, id)).run();
  },

  setIndexing(db: Db, id: string): void {
    db.update(repos).set({ index_status: "indexing" }).where(eq(repos.id, id)).run();
  },

  updateProFeatures(
    db: Db,
    id: string,
    flags: { enable_embeddings?: number; enable_summaries?: number; enable_vocab_clusters?: number },
  ): void {
    const set: Record<string, unknown> = { updated_at: sql`datetime('now')` };
    if (flags.enable_embeddings !== undefined) set.enable_embeddings = flags.enable_embeddings;
    if (flags.enable_summaries !== undefined) set.enable_summaries = flags.enable_summaries;
    if (flags.enable_vocab_clusters !== undefined) set.enable_vocab_clusters = flags.enable_vocab_clusters;
    db.update(repos).set(set).where(eq(repos.id, id)).run();
  },

  remove(db: Db, id: string): boolean {
    db.delete(fileCochanges).where(eq(fileCochanges.repo_id, id)).run();
    db.delete(fileStats).where(eq(fileStats.repo_id, id)).run();
    db.delete(fileImports).where(eq(fileImports.repo_id, id)).run();
    db.delete(fileMetadata).where(eq(fileMetadata.repo_id, id)).run();
    db.delete(chunks).where(eq(chunks.repo_id, id)).run();
    const result = db.delete(repos).where(eq(repos.id, id)).run();
    return result.changes > 0;
  },
};

// --- Chunk Queries ---

export const chunkQueries = {
  upsert(
    db: Db,
    repoId: string,
    path: string,
    chunkIndex: number,
    startLine: number,
    endLine: number,
    content: string,
    chunkHash: string,
    lastSeenCommit: string,
    language: string | null,
  ): void {
    db.insert(chunks)
      .values({
        id: randomUUID(),
        repo_id: repoId,
        path,
        chunk_index: chunkIndex,
        start_line: startLine,
        end_line: endLine,
        content,
        chunk_hash: chunkHash,
        last_seen_commit: lastSeenCommit,
        language,
      })
      .onConflictDoUpdate({
        target: [chunks.repo_id, chunks.path, chunks.chunk_index, chunks.chunk_hash],
        set: {
          last_seen_commit: lastSeenCommit,
          updated_at: sql`datetime('now')`,
        },
      })
      .run();
  },

  getByRepoPath(db: Db, repoId: string, path: string) {
    return db
      .select({
        id: chunks.id,
        chunk_index: chunks.chunk_index,
        chunk_hash: chunks.chunk_hash,
      })
      .from(chunks)
      .where(and(eq(chunks.repo_id, repoId), eq(chunks.path, path)))
      .orderBy(chunks.chunk_index)
      .all();
  },

  updateLastSeen(db: Db, id: string, repoId: string, commit: string): void {
    db.update(chunks)
      .set({ last_seen_commit: commit, updated_at: sql`datetime('now')` })
      .where(and(eq(chunks.id, id), eq(chunks.repo_id, repoId)))
      .run();
  },

  deleteById(db: Db, id: string, repoId: string): void {
    db.delete(chunks)
      .where(and(eq(chunks.id, id), eq(chunks.repo_id, repoId)))
      .run();
  },

  deleteByRepoPath(db: Db, repoId: string, path: string): number {
    const result = db
      .delete(chunks)
      .where(and(eq(chunks.repo_id, repoId), eq(chunks.path, path)))
      .run();
    return result.changes;
  },

  countByRepo(db: Db, repoId: string): number {
    const row = db.select({ count: sql<number>`count(*)` }).from(chunks).where(eq(chunks.repo_id, repoId)).get();
    return row?.count ?? 0;
  },

  getAllByRepo(db: Db, repoId: string) {
    return db
      .select({
        path: chunks.path,
        content: chunks.content,
        language: chunks.language,
        chunk_index: chunks.chunk_index,
      })
      .from(chunks)
      .where(eq(chunks.repo_id, repoId))
      .orderBy(chunks.path, chunks.chunk_index)
      .all();
  },

  getUnembedded(db: Db, repoId: string, limit: number) {
    return db
      .select({ id: chunks.id, content: chunks.content })
      .from(chunks)
      .where(
        and(
          eq(chunks.repo_id, repoId),
          sql`embedding IS NULL`,
          sql`language IN ('typescript','javascript','python','ruby','go','rust','java','kotlin','csharp','cpp','c','swift','php','shell')`,
          sql`content IS NOT NULL AND trim(content) != ''`,
        ),
      )
      .limit(limit)
      .all();
  },

  countUnembedded(db: Db, repoId: string): number {
    const row = db
      .select({ count: sql<number>`count(*)` })
      .from(chunks)
      .where(
        and(
          eq(chunks.repo_id, repoId),
          sql`embedding IS NULL`,
          sql`language IN ('typescript','javascript','python','ruby','go','rust','java','kotlin','csharp','cpp','c','swift','php','shell')`,
          sql`content IS NOT NULL AND trim(content) != ''`,
        ),
      )
      .get();
    return row?.count ?? 0;
  },

  updateEmbedding(db: Db, id: string, repoId: string, embedding: number[]): void {
    db.update(chunks)
      .set({
        embedding: toEmbeddingBlob(embedding),
        updated_at: sql`datetime('now')`,
      })
      .where(and(eq(chunks.id, id), eq(chunks.repo_id, repoId)))
      .run();
  },

  getAllEmbedded(db: Db, repoId: string) {
    return db
      .select({
        id: chunks.id,
        path: chunks.path,
        start_line: chunks.start_line,
        end_line: chunks.end_line,
        content: chunks.content,
        language: chunks.language,
        embedding: chunks.embedding,
      })
      .from(chunks)
      .where(and(eq(chunks.repo_id, repoId), sql`embedding IS NOT NULL`))
      .all()
      .map((r) => ({
        ...r,
        embedding: fromEmbeddingBlob(r.embedding as Buffer | null),
      }))
      .filter((r): r is typeof r & { embedding: Float32Array } => r.embedding !== null);
  },

  hasEmbeddings(db: Db, repoId: string): boolean {
    const row = db
      .select({ id: chunks.id })
      .from(chunks)
      .where(and(eq(chunks.repo_id, repoId), sql`embedding IS NOT NULL`))
      .limit(1)
      .get();
    return !!row;
  },

  getStats(db: Db, repoId: string) {
    const row = db
      .select({
        chunk_count: sql<number>`count(*)`,
        files_indexed: sql<number>`count(DISTINCT path)`,
        embedded_count: sql<number>`SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END)`,
        embeddable_count: sql<number>`SUM(CASE WHEN language IN ('typescript','javascript','python','ruby','go','rust','java','kotlin','csharp','cpp','c','swift','php','shell') AND content IS NOT NULL AND trim(content) != '' THEN 1 ELSE 0 END)`,
      })
      .from(chunks)
      .where(eq(chunks.repo_id, repoId))
      .get();
    return {
      chunk_count: row?.chunk_count ?? 0,
      files_indexed: row?.files_indexed ?? 0,
      embedded_count: row?.embedded_count ?? 0,
      embeddable_count: row?.embeddable_count ?? 0,
    };
  },
};

// --- Metadata Queries ---

export const metadataQueries = {
  upsert(
    db: Db,
    repoId: string,
    path: string,
    language: string,
    exports: string[],
    imports: string[],
    docstring: string,
    sections: string[],
    internals: string[],
  ): void {
    db.insert(fileMetadata)
      .values({
        id: randomUUID(),
        repo_id: repoId,
        path,
        language,
        exports: JSON.stringify(exports),
        imports: JSON.stringify(imports),
        docstring,
        sections: JSON.stringify(sections),
        internals: JSON.stringify(internals),
      })
      .onConflictDoUpdate({
        target: [fileMetadata.repo_id, fileMetadata.path],
        set: {
          language,
          exports: JSON.stringify(exports),
          imports: JSON.stringify(imports),
          docstring,
          sections: JSON.stringify(sections),
          internals: JSON.stringify(internals),
          updated_at: sql`datetime('now')`,
        },
      })
      .run();
  },

  getByRepo(db: Db, repoId: string) {
    return db
      .select({
        path: fileMetadata.path,
        language: fileMetadata.language,
        exports: fileMetadata.exports,
        docstring: fileMetadata.docstring,
        sections: fileMetadata.sections,
        internals: fileMetadata.internals,
        purpose: fileMetadata.purpose,
      })
      .from(fileMetadata)
      .where(eq(fileMetadata.repo_id, repoId))
      .orderBy(fileMetadata.path)
      .all()
      .map((r) => ({
        ...r,
        exports: jsonParse(r.exports, [] as string[]),
        docstring: r.docstring ?? "",
        sections: jsonParse(r.sections, [] as string[]),
        internals: jsonParse(r.internals, [] as string[]),
        purpose: r.purpose ?? "",
      }));
  },

  updatePurpose(db: Db, repoId: string, path: string, purpose: string, purposeHash: string): void {
    db.update(fileMetadata)
      .set({ purpose, purpose_hash: purposeHash })
      .where(and(eq(fileMetadata.repo_id, repoId), eq(fileMetadata.path, path)))
      .run();
  },

  setPurposeHash(db: Db, repoId: string, path: string, purposeHash: string): void {
    db.update(fileMetadata)
      .set({ purpose_hash: purposeHash })
      .where(and(eq(fileMetadata.repo_id, repoId), eq(fileMetadata.path, path)))
      .run();
  },

  getCandidatesForPurpose(db: Db, repoId: string, limit: number) {
    const rows = db
      .select({
        path: fileMetadata.path,
        exports: fileMetadata.exports,
        docstring: fileMetadata.docstring,
        first_chunk: chunks.content,
        chunk_hash: chunks.chunk_hash,
      })
      .from(fileMetadata)
      .innerJoin(
        chunks,
        and(eq(chunks.repo_id, fileMetadata.repo_id), eq(chunks.path, fileMetadata.path), eq(chunks.chunk_index, 0)),
      )
      .where(
        and(
          eq(fileMetadata.repo_id, repoId),
          sql`${fileMetadata.language} IN ('typescript','javascript','python','ruby','go','rust','java','kotlin','csharp','cpp','c','swift','php','shell','sql')`,
          sql`(${fileMetadata.purpose} = '' OR ${fileMetadata.purpose} IS NULL OR ${fileMetadata.purpose_hash} != ${chunks.chunk_hash})`,
        ),
      )
      .limit(limit)
      .all();
    return rows.map((r) => ({
      ...r,
      exports: jsonParse(r.exports, [] as string[]),
    }));
  },

  getStructuralStats(db: Db, repoId: string) {
    const metadata_count =
      db.select({ c: sql<number>`count(*)` }).from(fileMetadata).where(eq(fileMetadata.repo_id, repoId)).get()?.c ?? 0;
    const import_edge_count =
      db.select({ c: sql<number>`count(*)` }).from(fileImports).where(eq(fileImports.repo_id, repoId)).get()?.c ?? 0;
    const git_file_count =
      db.select({ c: sql<number>`count(*)` }).from(fileStats).where(eq(fileStats.repo_id, repoId)).get()?.c ?? 0;
    const cochange_pairs =
      db.select({ c: sql<number>`count(*)` }).from(fileCochanges).where(eq(fileCochanges.repo_id, repoId)).get()?.c ??
      0;
    const purpose_count =
      db
        .select({ c: sql<number>`count(*)` })
        .from(fileMetadata)
        .where(and(eq(fileMetadata.repo_id, repoId), sql`purpose != '' AND purpose IS NOT NULL`))
        .get()?.c ?? 0;
    const purpose_total =
      db
        .select({ c: sql<number>`count(*)` })
        .from(fileMetadata)
        .where(
          and(
            eq(fileMetadata.repo_id, repoId),
            sql`language IN ('typescript','javascript','python','ruby','go','rust','java','kotlin','csharp','cpp','c','swift','php','shell','sql')`,
          ),
        )
        .get()?.c ?? 0;
    return {
      metadata_count,
      import_edge_count,
      git_file_count,
      cochange_pairs,
      purpose_count,
      purpose_total,
    };
  },

  deleteByPath(db: Db, repoId: string, path: string): void {
    db.delete(fileMetadata)
      .where(and(eq(fileMetadata.repo_id, repoId), eq(fileMetadata.path, path)))
      .run();
  },
};

// --- Import Queries ---

export const importQueries = {
  deleteByRepo(db: Db, repoId: string): void {
    db.delete(fileImports).where(eq(fileImports.repo_id, repoId)).run();
  },

  insert(db: Db, repoId: string, sourcePath: string, targetPath: string): void {
    db.insert(fileImports)
      .values({
        id: randomUUID(),
        repo_id: repoId,
        source_path: sourcePath,
        target_path: targetPath,
      })
      .onConflictDoNothing()
      .run();
  },

  getByRepo(db: Db, repoId: string) {
    return db
      .select({
        source_path: fileImports.source_path,
        target_path: fileImports.target_path,
      })
      .from(fileImports)
      .where(eq(fileImports.repo_id, repoId))
      .all();
  },

  getByTargets(db: Db, repoId: string, targets: string[]) {
    if (!targets.length) return [];
    return db
      .select({
        target_path: fileImports.target_path,
        source_path: fileImports.source_path,
      })
      .from(fileImports)
      .where(and(eq(fileImports.repo_id, repoId), inArray(fileImports.target_path, targets)))
      .all();
  },

  getBySources(db: Db, repoId: string, sources: string[]) {
    if (!sources.length) return [];
    return db
      .select({
        source_path: fileImports.source_path,
        target_path: fileImports.target_path,
      })
      .from(fileImports)
      .where(and(eq(fileImports.repo_id, repoId), inArray(fileImports.source_path, sources)))
      .all();
  },

  getIndegrees(db: Db, repoId: string): Map<string, number> {
    const rows = db
      .select({
        target_path: fileImports.target_path,
        indegree: sql<number>`count(*)`,
      })
      .from(fileImports)
      .where(eq(fileImports.repo_id, repoId))
      .groupBy(fileImports.target_path)
      .all();
    return new Map(rows.map((r) => [r.target_path, r.indegree]));
  },
};

// --- Stats Queries ---

export const statsQueries = {
  upsert(db: Db, repoId: string, path: string, commitCount: number, recentCount: number, lastModified: string): void {
    db.insert(fileStats)
      .values({
        id: randomUUID(),
        repo_id: repoId,
        path,
        commit_count: commitCount,
        recent_count: recentCount,
        last_modified: lastModified,
      })
      .onConflictDoUpdate({
        target: [fileStats.repo_id, fileStats.path],
        set: {
          commit_count: sql`${fileStats.commit_count} + excluded.commit_count`,
          recent_count: sql`excluded.recent_count`,
          last_modified: sql`MAX(${fileStats.last_modified}, excluded.last_modified)`,
        },
      })
      .run();
  },

  getByRepo(
    db: Db,
    repoId: string,
  ): Map<
    string,
    {
      path: string;
      commit_count: number;
      recent_count: number;
      last_modified: Date | null;
    }
  > {
    const rows = db.select().from(fileStats).where(eq(fileStats.repo_id, repoId)).all();
    return new Map(
      rows.map((r) => [
        r.path,
        {
          path: r.path,
          commit_count: r.commit_count,
          recent_count: r.recent_count,
          last_modified: r.last_modified ? new Date(r.last_modified) : null,
        },
      ]),
    );
  },
};

// --- Cochange Queries ---

export const cochangeQueries = {
  upsert(db: Db, repoId: string, pathA: string, pathB: string, count: number): void {
    db.insert(fileCochanges)
      .values({
        id: randomUUID(),
        repo_id: repoId,
        path_a: pathA,
        path_b: pathB,
        cochange_count: count,
      })
      .onConflictDoUpdate({
        target: [fileCochanges.repo_id, fileCochanges.path_a, fileCochanges.path_b],
        set: {
          cochange_count: sql`${fileCochanges.cochange_count} + excluded.cochange_count`,
        },
      })
      .run();
  },

  getByPaths(db: Db, repoId: string, paths: string[], limit = 10) {
    if (!paths.length) return [];
    const rows = db
      .select()
      .from(fileCochanges)
      .where(
        and(
          eq(fileCochanges.repo_id, repoId),
          or(inArray(fileCochanges.path_a, paths), inArray(fileCochanges.path_b, paths)),
        ),
      )
      .orderBy(sql`cochange_count DESC`)
      .limit(limit)
      .all();
    const pathSet = new Set(paths);
    return rows.map((r) => ({
      path: pathSet.has(r.path_a) ? r.path_a : r.path_b,
      partner: pathSet.has(r.path_a) ? r.path_b : r.path_a,
      count: r.cochange_count,
    }));
  },

  getPartners(db: Db, repoId: string, paths: string[], minCount = 5, limit = 10) {
    if (!paths.length) return [];
    const rows = db
      .select()
      .from(fileCochanges)
      .where(
        and(
          eq(fileCochanges.repo_id, repoId),
          or(inArray(fileCochanges.path_a, paths), inArray(fileCochanges.path_b, paths)),
          gte(fileCochanges.cochange_count, minCount),
        ),
      )
      .orderBy(sql`cochange_count DESC`)
      .limit(limit)
      .all();
    const pathSet = new Set(paths);
    return rows.map((r) => ({
      path: pathSet.has(r.path_a) ? r.path_a : r.path_b,
      partner: pathSet.has(r.path_a) ? r.path_b : r.path_a,
      count: r.cochange_count,
    }));
  },
};

// --- Request Log Queries ---

export const logQueries = {
  insert(
    db: Db,
    method: string,
    path: string,
    status: number,
    durationMs: number,
    source: string,
    requestBody?: string,
    responseSize?: number,
    responseBody?: string,
    trace?: string,
  ): void {
    db.insert(requestLogs)
      .values({
        id: randomUUID(),
        method,
        path,
        status,
        duration_ms: durationMs,
        source,
        request_body: requestBody ?? null,
        response_size: responseSize ?? null,
        response_body: responseBody ?? null,
        trace: trace ?? null,
      })
      .run();
  },

  list(
    db: Db,
    opts: { limit?: number; offset?: number; method?: string; path?: string; status?: number; source?: string } = {},
  ) {
    const { limit = 50, offset = 0, method, path, status, source } = opts;
    const conditions = [];
    if (method) conditions.push(eq(requestLogs.method, method));
    if (path) conditions.push(sql`${requestLogs.path} LIKE ${`%${path}%`}`);
    if (status) conditions.push(eq(requestLogs.status, status));
    if (source) conditions.push(eq(requestLogs.source, source));

    const where = conditions.length ? and(...conditions) : undefined;
    const rows = db
      .select()
      .from(requestLogs)
      .where(where)
      .orderBy(sql`created_at DESC`)
      .limit(limit)
      .offset(offset)
      .all();

    const total = db.select({ count: sql<number>`count(*)` }).from(requestLogs).where(where).get()?.count ?? 0;

    return { rows, total };
  },

  prune(db: Db, maxAgeDays = 7): number {
    const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
    const result = db.delete(requestLogs).where(sql`created_at < ${cutoff}`).run();
    return result.changes;
  },

  summary(db: Db) {
    const today = new Date().toISOString().slice(0, 10);
    const totalToday =
      db.select({ count: sql<number>`count(*)` }).from(requestLogs).where(sql`created_at >= ${today}`).get()?.count ??
      0;

    const bySource = db
      .select({ source: requestLogs.source, count: sql<number>`count(*)` })
      .from(requestLogs)
      .where(sql`created_at >= ${today}`)
      .groupBy(requestLogs.source)
      .all();

    const byEndpoint = db
      .select({
        method: requestLogs.method,
        path: requestLogs.path,
        count: sql<number>`count(*)`,
      })
      .from(requestLogs)
      .where(sql`created_at >= ${today}`)
      .groupBy(requestLogs.method, requestLogs.path)
      .orderBy(sql`count(*) DESC`)
      .limit(10)
      .all();

    return { total_today: totalToday, by_source: bySource, by_endpoint: byEndpoint };
  },
};

// --- Usage Counter Queries ---

export type UsageCounter =
  | "context_queries"
  | "embedding_requests"
  | "embedding_chunks"
  | "purpose_requests"
  | "repos_indexed";

export const usageQueries = {
  increment(db: Db, counter: UsageCounter, amount = 1): void {
    const today = new Date().toISOString().slice(0, 10);
    const existing = db.select({ id: usageCounters.id }).from(usageCounters).where(eq(usageCounters.date, today)).get();
    if (existing) {
      db.update(usageCounters)
        .set({
          [counter]: sql`${usageCounters[counter]} + ${amount}`,
          updated_at: sql`datetime('now')`,
        })
        .where(eq(usageCounters.id, existing.id))
        .run();
    } else {
      db.insert(usageCounters)
        .values({ id: randomUUID(), date: today, [counter]: amount })
        .run();
    }
  },

  getByDate(db: Db, date: string) {
    return db.select().from(usageCounters).where(eq(usageCounters.date, date)).get() ?? null;
  },

  getUnsynced(db: Db) {
    return db
      .select()
      .from(usageCounters)
      .where(
        sql`synced_at IS NULL AND (context_queries > 0 OR embedding_requests > 0 OR purpose_requests > 0 OR repos_indexed > 0)`,
      )
      .all();
  },

  markSynced(db: Db, date: string): void {
    db.update(usageCounters).set({ synced_at: sql`datetime('now')` }).where(eq(usageCounters.date, date)).run();
  },

  getToday(db: Db) {
    const today = new Date().toISOString().slice(0, 10);
    return this.getByDate(db, today);
  },
};

// --- Telemetry Queries ---

export const telemetryQueries = {
  insert(db: Db, eventType: string, eventData?: Record<string, unknown>): void {
    db.insert(telemetryEvents)
      .values({
        id: randomUUID(),
        event_type: eventType,
        event_data: eventData ? JSON.stringify(eventData) : null,
      })
      .run();
  },

  getUnsynced(db: Db, limit = 500) {
    return db
      .select()
      .from(telemetryEvents)
      .where(isNull(telemetryEvents.synced_at))
      .orderBy(telemetryEvents.created_at)
      .limit(limit)
      .all();
  },

  markSynced(db: Db, ids: string[]): void {
    if (!ids.length) return;
    db.update(telemetryEvents).set({ synced_at: sql`datetime('now')` }).where(inArray(telemetryEvents.id, ids)).run();
  },

  prune(db: Db, maxAgeDays = 30): number {
    const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
    const result = db.delete(telemetryEvents).where(sql`synced_at IS NOT NULL AND created_at < ${cutoff}`).run();
    return result.changes;
  },
};

// --- Settings Queries ---

export const settingsQueries = {
  get(db: Db, key: string): string | null {
    const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get();
    return row?.value ?? null;
  },

  set(db: Db, key: string, value: string): void {
    db.insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updated_at: sql`datetime('now')` },
      })
      .run();
  },

  getAll(db: Db): Record<string, string> {
    const rows = db.select().from(settings).all();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },

  delete(db: Db, key: string): void {
    db.delete(settings).where(eq(settings.key, key)).run();
  },
};

export { jsonParse };
