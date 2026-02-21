import { and, count, eq, like, or, sql } from "drizzle-orm";
import type { ParsedSymbol } from "../parsers/types.js";
import type { Db } from "./connection.js";
import { chunks, fileCochanges, fileImports, fileMetadata, fileStats, repos } from "./schema.js";

// ── Aggregate queries ────────────────────────────────────────────────────────

export const aggregateQueries = {
  counts(db: Db) {
    const reposCount = db.select({ n: count() }).from(repos).get()!.n;
    const filesCount = db.select({ n: count() }).from(fileMetadata).get()!.n;
    return { repos: reposCount, files: filesCount };
  },

  filesList(db: Db, repoId: string, opts: { limit: number; offset: number; search?: string }) {
    const conditions = [eq(fileMetadata.repo_id, repoId)];
    if (opts.search) conditions.push(like(fileMetadata.path, `%${opts.search}%`));

    const files = db
      .select({
        path: fileMetadata.path,
        language: fileMetadata.language,
        exports: fileMetadata.exports,
        import_count: count(fileImports.id),
      })
      .from(fileMetadata)
      .leftJoin(
        fileImports,
        and(eq(fileImports.repo_id, fileMetadata.repo_id), eq(fileImports.source_path, fileMetadata.path)),
      )
      .where(and(...conditions))
      .groupBy(fileMetadata.path)
      .orderBy(fileMetadata.path)
      .limit(opts.limit)
      .offset(opts.offset)
      .all();

    const total = db
      .select({ n: count() })
      .from(fileMetadata)
      .where(and(...conditions))
      .get()!.n;

    return { files, total };
  },

  repoFileCounts(db: Db): Record<string, number> {
    const rows = db
      .select({ repo_id: fileMetadata.repo_id, n: count() })
      .from(fileMetadata)
      .groupBy(fileMetadata.repo_id)
      .all();
    return Object.fromEntries(rows.map((r) => [r.repo_id, r.n]));
  },

  repoLanguageCounts(db: Db, repoId: string): { language: string; count: number }[] {
    return db
      .select({ language: fileMetadata.language, n: count() })
      .from(fileMetadata)
      .where(eq(fileMetadata.repo_id, repoId))
      .groupBy(fileMetadata.language)
      .orderBy(sql`count(*) DESC`)
      .all()
      .filter((r) => r.language != null)
      .map((r) => ({ language: r.language!, count: r.n }));
  },

  repoImportCount(db: Db, repoId: string): number {
    return db.select({ n: count() }).from(fileImports).where(eq(fileImports.repo_id, repoId)).get()!.n;
  },

  fileCochanges(db: Db, repoId: string, path: string, limit = 20) {
    return db
      .select()
      .from(fileCochanges)
      .where(and(eq(fileCochanges.repo_id, repoId), or(eq(fileCochanges.path_a, path), eq(fileCochanges.path_b, path))))
      .orderBy(sql`${fileCochanges.cochange_count} DESC`)
      .limit(limit)
      .all();
  },
};

// ── Repo queries ──────────────────────────────────────────────────────────────

export const repoQueries = {
  insert(
    db: Db,
    data: {
      identity_key: string;
      name: string;
      root_path: string;
      remote_url?: string | null;
    },
  ) {
    const id = crypto.randomUUID();
    return db
      .insert(repos)
      .values({
        id,
        identity_key: data.identity_key,
        name: data.name,
        root_path: data.root_path,
        remote_url: data.remote_url ?? null,
        index_status: "pending",
      })
      .returning()
      .get();
  },

  getById(db: Db, id: string) {
    return db.select().from(repos).where(eq(repos.id, id)).get() ?? null;
  },

  getByIdentityKey(db: Db, key: string) {
    return db.select().from(repos).where(eq(repos.identity_key, key)).get() ?? null;
  },

  getAll(db: Db) {
    return db.select().from(repos).all();
  },

  remove(db: Db, id: string) {
    db.delete(repos).where(eq(repos.id, id)).run();
  },

  setIndexing(db: Db, id: string) {
    db.update(repos).set({ index_status: "indexing" }).where(eq(repos.id, id)).run();
  },

  updateIndexState(db: Db, id: string, commit: string, status: string) {
    db.update(repos)
      .set({
        last_indexed_commit: commit,
        index_status: status,
        last_indexed_at: new Date().toISOString(),
      })
      .where(eq(repos.id, id))
      .run();
  },

  updateGitAnalysisCommit(db: Db, id: string, commit: string) {
    db.update(repos).set({ last_git_analysis_commit: commit }).where(eq(repos.id, id)).run();
  },
};

// ── Chunk queries ─────────────────────────────────────────────────────────────

export const chunkQueries = {
  upsertChunks(
    db: Db,
    repoId: string,
    path: string,
    newChunks: Array<{
      chunkIndex: number;
      startLine: number;
      endLine: number;
      content: string;
      chunkHash: string;
      lastSeenCommit: string;
      language: string | null;
    }>,
  ) {
    db.transaction(() => {
      // Delete existing chunks for this path
      db.delete(chunks)
        .where(and(eq(chunks.repo_id, repoId), eq(chunks.path, path)))
        .run();
      // Insert new chunks
      for (const c of newChunks) {
        db.insert(chunks)
          .values({
            id: crypto.randomUUID(),
            repo_id: repoId,
            path,
            chunk_index: c.chunkIndex,
            start_line: c.startLine,
            end_line: c.endLine,
            content: c.content,
            chunk_hash: c.chunkHash,
            last_seen_commit: c.lastSeenCommit,
            language: c.language,
          })
          .run();
      }
    });
  },

  getByRepoPath(db: Db, repoId: string, path: string) {
    return db
      .select()
      .from(chunks)
      .where(and(eq(chunks.repo_id, repoId), eq(chunks.path, path)))
      .orderBy(chunks.chunk_index)
      .all();
  },

  deleteByRepo(db: Db, repoId: string) {
    db.delete(chunks).where(eq(chunks.repo_id, repoId)).run();
  },

  getAllPaths(db: Db, repoId: string): string[] {
    const rows = db.selectDistinct({ path: chunks.path }).from(chunks).where(eq(chunks.repo_id, repoId)).all();
    return rows.map((r) => r.path);
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
};

// ── Metadata queries ──────────────────────────────────────────────────────────

export const metadataQueries = {
  upsert(
    db: Db,
    repoId: string,
    path: string,
    metadata: {
      language: string | null;
      exports: string[];
      imports: string[];
      docstring: string;
      sections: string[];
      internals: string[];
      symbols: ParsedSymbol[];
    },
  ) {
    const existing = db
      .select({ id: fileMetadata.id })
      .from(fileMetadata)
      .where(and(eq(fileMetadata.repo_id, repoId), eq(fileMetadata.path, path)))
      .get();

    if (existing) {
      db.update(fileMetadata)
        .set({
          language: metadata.language,
          exports: JSON.stringify(metadata.exports),
          imports: JSON.stringify(metadata.imports),
          docstring: metadata.docstring,
          sections: JSON.stringify(metadata.sections),
          internals: JSON.stringify(metadata.internals),
          symbols: JSON.stringify(metadata.symbols),
        })
        .where(eq(fileMetadata.id, existing.id))
        .run();
    } else {
      db.insert(fileMetadata)
        .values({
          id: crypto.randomUUID(),
          repo_id: repoId,
          path,
          language: metadata.language,
          exports: JSON.stringify(metadata.exports),
          imports: JSON.stringify(metadata.imports),
          docstring: metadata.docstring,
          sections: JSON.stringify(metadata.sections),
          internals: JSON.stringify(metadata.internals),
          symbols: JSON.stringify(metadata.symbols),
        })
        .run();
    }
  },

  getByRepoPath(db: Db, repoId: string, path: string) {
    return (
      db
        .select()
        .from(fileMetadata)
        .where(and(eq(fileMetadata.repo_id, repoId), eq(fileMetadata.path, path)))
        .get() ?? null
    );
  },

  getAllForRepo(db: Db, repoId: string) {
    return db.select().from(fileMetadata).where(eq(fileMetadata.repo_id, repoId)).all();
  },

  hasAnySymbols(db: Db, repoId: string): boolean {
    const row = db
      .select({ n: count() })
      .from(fileMetadata)
      .where(and(eq(fileMetadata.repo_id, repoId), sql`${fileMetadata.symbols} <> '[]'`))
      .get();
    return (row?.n ?? 0) > 0;
  },

  hasAnySymbolEligibleFiles(db: Db, repoId: string): boolean {
    const row = db
      .select({ n: count() })
      .from(fileMetadata)
      .where(
        and(
          eq(fileMetadata.repo_id, repoId),
          or(eq(fileMetadata.language, "typescript"), eq(fileMetadata.language, "javascript")),
        ),
      )
      .get();
    return (row?.n ?? 0) > 0;
  },
};

// ── Import queries ────────────────────────────────────────────────────────────

export const importQueries = {
  insertEdges(db: Db, repoId: string, edges: Array<{ sourcePath: string; targetPath: string }>) {
    db.transaction(() => {
      for (const edge of edges) {
        db.insert(fileImports)
          .values({
            id: crypto.randomUUID(),
            repo_id: repoId,
            source_path: edge.sourcePath,
            target_path: edge.targetPath,
          })
          .onConflictDoNothing()
          .run();
      }
    });
  },

  clearForRepo(db: Db, repoId: string) {
    db.delete(fileImports).where(eq(fileImports.repo_id, repoId)).run();
  },

  getImporters(db: Db, repoId: string, targetPath: string) {
    return db
      .select({ source_path: fileImports.source_path })
      .from(fileImports)
      .where(and(eq(fileImports.repo_id, repoId), eq(fileImports.target_path, targetPath)))
      .all()
      .map((r) => r.source_path);
  },

  getImports(db: Db, repoId: string, sourcePath: string) {
    return db
      .select({ target_path: fileImports.target_path })
      .from(fileImports)
      .where(and(eq(fileImports.repo_id, repoId), eq(fileImports.source_path, sourcePath)))
      .all()
      .map((r) => r.target_path);
  },
};

// ── Stats queries ─────────────────────────────────────────────────────────────

export const statsQueries = {
  upsertStats(
    db: Db,
    repoId: string,
    stats: Array<{
      path: string;
      commitCount: number;
      recentCount: number;
      lastModified: string | null;
    }>,
  ) {
    db.transaction(() => {
      for (const s of stats) {
        const existing = db
          .select({ id: fileStats.id })
          .from(fileStats)
          .where(and(eq(fileStats.repo_id, repoId), eq(fileStats.path, s.path)))
          .get();

        if (existing) {
          db.update(fileStats)
            .set({
              commit_count: s.commitCount,
              recent_count: s.recentCount,
              last_modified: s.lastModified,
            })
            .where(eq(fileStats.id, existing.id))
            .run();
        } else {
          db.insert(fileStats)
            .values({
              id: crypto.randomUUID(),
              repo_id: repoId,
              path: s.path,
              commit_count: s.commitCount,
              recent_count: s.recentCount,
              last_modified: s.lastModified,
            })
            .run();
        }
      }
    });
  },

  getByPath(db: Db, repoId: string, path: string) {
    return (
      db
        .select()
        .from(fileStats)
        .where(and(eq(fileStats.repo_id, repoId), eq(fileStats.path, path)))
        .get() ?? null
    );
  },
};

// ── Co-change queries ─────────────────────────────────────────────────────────

export const cochangeQueries = {
  upsertPairs(db: Db, repoId: string, pairs: Array<{ pathA: string; pathB: string; count: number }>) {
    db.transaction(() => {
      for (const p of pairs) {
        const existing = db
          .select({ id: fileCochanges.id })
          .from(fileCochanges)
          .where(
            and(
              eq(fileCochanges.repo_id, repoId),
              eq(fileCochanges.path_a, p.pathA),
              eq(fileCochanges.path_b, p.pathB),
            ),
          )
          .get();

        if (existing) {
          db.update(fileCochanges).set({ cochange_count: p.count }).where(eq(fileCochanges.id, existing.id)).run();
        } else {
          db.insert(fileCochanges)
            .values({
              id: crypto.randomUUID(),
              repo_id: repoId,
              path_a: p.pathA,
              path_b: p.pathB,
              cochange_count: p.count,
            })
            .run();
        }
      }
    });
  },

  getPartners(db: Db, repoId: string, path: string) {
    return db
      .select()
      .from(fileCochanges)
      .where(and(eq(fileCochanges.repo_id, repoId), eq(fileCochanges.path_a, path)))
      .orderBy(sql`${fileCochanges.cochange_count} DESC`)
      .all();
  },

  clearForRepo(db: Db, repoId: string) {
    db.delete(fileCochanges).where(eq(fileCochanges.repo_id, repoId)).run();
  },
};

// ── Graph queries ──────────────────────────────────────────────────────────

export const graphQueries = {
  /** All import edges for a repo */
  allImportEdges(db: Db, repoId: string): { source: string; target: string }[] {
    return db
      .select({ source: fileImports.source_path, target: fileImports.target_path })
      .from(fileImports)
      .where(eq(fileImports.repo_id, repoId))
      .all();
  },

  /** All cochange pairs for a repo */
  allCochanges(db: Db, repoId: string): { path_a: string; path_b: string; cochange_count: number }[] {
    return db
      .select({
        path_a: fileCochanges.path_a,
        path_b: fileCochanges.path_b,
        cochange_count: fileCochanges.cochange_count,
      })
      .from(fileCochanges)
      .where(eq(fileCochanges.repo_id, repoId))
      .all();
  },

  /** Cochanges filtered by minimum weight */
  filteredCochanges(
    db: Db,
    repoId: string,
    minWeight: number,
  ): { path_a: string; path_b: string; cochange_count: number }[] {
    return db
      .select({
        path_a: fileCochanges.path_a,
        path_b: fileCochanges.path_b,
        cochange_count: fileCochanges.cochange_count,
      })
      .from(fileCochanges)
      .where(and(eq(fileCochanges.repo_id, repoId), sql`${fileCochanges.cochange_count} >= ${minWeight}`))
      .all();
  },

  /** All file stats for a repo */
  allFileStats(db: Db, repoId: string) {
    return db
      .select({
        path: fileStats.path,
        commit_count: fileStats.commit_count,
        recent_count: fileStats.recent_count,
      })
      .from(fileStats)
      .where(eq(fileStats.repo_id, repoId))
      .all();
  },
};
