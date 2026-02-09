import { sql } from "drizzle-orm";
import { blob, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const uuid = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const now = () => text("created_at").notNull().default(sql`(datetime('now'))`);
const updatedAt = () => text("updated_at").notNull().default(sql`(datetime('now'))`);

export const repos = sqliteTable(
  "repos",
  {
    id: uuid(),
    identity_key: text("identity_key").notNull().unique(),
    name: text("name").notNull(),
    root_path: text("root_path").notNull(),
    remote_url: text("remote_url"),
    last_indexed_commit: text("last_indexed_commit"),
    index_status: text("index_status").notNull().default("pending"),
    last_indexed_at: text("last_indexed_at"),
    last_git_analysis_commit: text("last_git_analysis_commit"),
    max_import_depth: integer("max_import_depth").default(0),
    vocab_clusters: text("vocab_clusters"),
    created_at: now(),
    updated_at: updatedAt(),
  },
  (t) => [index("idx_repos_identity").on(t.identity_key)],
);

export const chunks = sqliteTable(
  "chunks",
  {
    id: uuid(),
    repo_id: text("repo_id")
      .notNull()
      .references(() => repos.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    chunk_index: integer("chunk_index").notNull(),
    start_line: integer("start_line").notNull(),
    end_line: integer("end_line").notNull(),
    content: text("content").notNull(),
    chunk_hash: text("chunk_hash").notNull(),
    last_seen_commit: text("last_seen_commit").notNull(),
    language: text("language"),
    embedding: blob("embedding"),
    created_at: now(),
    updated_at: updatedAt(),
  },
  (t) => [
    uniqueIndex("idx_chunks_unique").on(t.repo_id, t.path, t.chunk_index, t.chunk_hash),
    index("idx_chunks_repo_path").on(t.repo_id, t.path),
    index("idx_chunks_repo").on(t.repo_id),
    index("idx_chunks_hash").on(t.repo_id, t.chunk_hash),
  ],
);

export const fileMetadata = sqliteTable(
  "file_metadata",
  {
    id: uuid(),
    repo_id: text("repo_id")
      .notNull()
      .references(() => repos.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    language: text("language"),
    exports: text("exports").default("[]"),
    imports: text("imports").default("[]"),
    docstring: text("docstring").default(""),
    purpose: text("purpose").default(""),
    purpose_hash: text("purpose_hash").default(""),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("idx_file_metadata_unique").on(t.repo_id, t.path), index("idx_file_metadata_repo").on(t.repo_id)],
);

export const fileImports = sqliteTable(
  "file_imports",
  {
    id: uuid(),
    repo_id: text("repo_id")
      .notNull()
      .references(() => repos.id, { onDelete: "cascade" }),
    source_path: text("source_path").notNull(),
    target_path: text("target_path").notNull(),
  },
  (t) => [
    uniqueIndex("idx_file_imports_unique").on(t.repo_id, t.source_path, t.target_path),
    index("idx_file_imports_target").on(t.repo_id, t.target_path),
  ],
);

export const fileStats = sqliteTable(
  "file_stats",
  {
    id: uuid(),
    repo_id: text("repo_id")
      .notNull()
      .references(() => repos.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    commit_count: integer("commit_count").notNull().default(0),
    recent_count: integer("recent_count").notNull().default(0),
    last_modified: text("last_modified"),
  },
  (t) => [uniqueIndex("idx_file_stats_unique").on(t.repo_id, t.path)],
);

export const fileCochanges = sqliteTable(
  "file_cochanges",
  {
    id: uuid(),
    repo_id: text("repo_id")
      .notNull()
      .references(() => repos.id, { onDelete: "cascade" }),
    path_a: text("path_a").notNull(),
    path_b: text("path_b").notNull(),
    cochange_count: integer("cochange_count").notNull().default(1),
  },
  (t) => [
    uniqueIndex("idx_file_cochanges_unique").on(t.repo_id, t.path_a, t.path_b),
    index("idx_cochanges_lookup").on(t.repo_id, t.path_a),
  ],
);

export const requestLogs = sqliteTable(
  "request_logs",
  {
    id: uuid(),
    method: text("method").notNull(),
    path: text("path").notNull(),
    status: integer("status").notNull(),
    duration_ms: integer("duration_ms").notNull(),
    source: text("source").notNull().default("api"),
    request_body: text("request_body"),
    response_size: integer("response_size"),
    created_at: now(),
  },
  (t) => [index("idx_request_logs_created").on(t.created_at), index("idx_request_logs_source").on(t.source)],
);
