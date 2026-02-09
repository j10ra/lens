export interface Repo {
  id: string;
  identity_key: string;
  name: string;
  root_path: string;
  remote_url: string | null;
  last_indexed_commit: string | null;
  index_status: string;
  last_indexed_at: string | null;
  last_git_analysis_commit: string | null;
  max_import_depth: number;
  vocab_clusters: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chunk {
  id: string;
  repo_id: string;
  path: string;
  chunk_index: number;
  start_line: number;
  end_line: number;
  content: string;
  chunk_hash: string;
  last_seen_commit: string;
  language: string | null;
  embedding: Buffer | null;
  created_at: string;
  updated_at: string;
}

export interface FileMetadata {
  id: string;
  repo_id: string;
  path: string;
  language: string | null;
  exports: string[];
  imports: string[];
  docstring: string;
  purpose: string;
  purpose_hash: string;
  updated_at: string;
}

export interface FileImport {
  id: string;
  repo_id: string;
  source_path: string;
  target_path: string;
}

export interface FileStat {
  id: string;
  repo_id: string;
  path: string;
  commit_count: number;
  recent_count: number;
  last_modified: string | null;
}

export interface FileCochange {
  id: string;
  repo_id: string;
  path_a: string;
  path_b: string;
  cochange_count: number;
}

export interface IndexResult {
  files_scanned: number;
  chunks_created: number;
  chunks_unchanged: number;
  chunks_deleted: number;
  duration_ms: number;
}

export interface ContextResponse {
  context_pack: string;
  stats: {
    files_in_context: number;
    index_fresh: boolean;
    duration_ms: number;
    cached: boolean;
  };
}

export interface VocabCluster {
  terms: string[];
  files: string[];
}

export interface FileMetadataRow {
  path: string;
  language: string | null;
  exports: string[];
  docstring: string;
  purpose: string;
}

export interface FileStatRow {
  path: string;
  commit_count: number;
  recent_count: number;
  last_modified: Date | null;
}

export interface CochangeRow {
  path: string;
  partner: string;
  count: number;
}

export interface VectorResult {
  id: string;
  path: string;
  start_line: number;
  end_line: number;
  content: string;
  language: string | null;
  score: number;
}

export interface InterpretedQuery {
  files: Array<{ path: string; reason: string }>;
  fileCap: number;
}

export interface ContextData {
  goal: string;
  files: Array<{ path: string; reason: string }>;
  metadata: FileMetadataRow[];
  reverseImports: Map<string, string[]>;
  forwardImports: Map<string, string[]>;
  hop2Deps: Map<string, string[]>;
  cochanges: CochangeRow[];
  fileStats: Map<string, FileStatRow>;
}

export interface EmbedResult {
  embedded_count: number;
  skipped_count: number;
  duration_ms: number;
}

export interface EnrichResult {
  enriched: number;
  skipped: number;
  duration_ms: number;
}

export interface RegisterResponse {
  repo_id: string;
  identity_key: string;
  name: string;
  created: boolean;
}

export interface StatusResponse {
  index_status: string;
  indexed_commit: string | null;
  current_head: string | null;
  is_stale: boolean;
  chunk_count: number;
  files_indexed: number;
  embedded_count: number;
  embeddable_count: number;
  embedded_pct: number;
  metadata_count: number;
  import_edge_count: number;
  git_commits_analyzed: number;
  cochange_pairs: number;
  purpose_count: number;
  purpose_total: number;
}
