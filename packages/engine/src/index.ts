// DB

// Capabilities
export type { Capabilities } from "./capabilities";
// Context
export { buildContext, type ContextOptions } from "./context/context";
export { formatContextPack } from "./context/formatter";
export { interpretQuery, isNoisePath } from "./context/query-interpreter";
export {
  get2HopReverseDeps,
  getAllFileStats,
  getCochangePartners,
  getCochanges,
  getForwardImports,
  getIndegrees,
  getReverseImports,
  loadFileMetadata,
  loadVocabClusters,
} from "./context/structural";
export { vectorSearch } from "./context/vector";
export { closeDb, type Db, getDb, getRawDb, openDb } from "./db/connection";
// Query helpers (for advanced usage)
export {
  chunkQueries,
  cochangeQueries,
  importQueries,
  logQueries,
  metadataQueries,
  repoQueries,
  settingsQueries,
  statsQueries,
  telemetryQueries,
  type UsageCounter,
  usageQueries,
} from "./db/queries";
export { chunkFile, DEFAULT_CHUNKING_PARAMS } from "./index/chunker";
export { detectLanguage, diffScan, fullScan, getHeadCommit, isBinaryExt, isDocFile } from "./index/discovery";
export { ensureEmbedded } from "./index/embed";
// Index
export { computeMaxImportDepth, ensureIndexed, runIndex } from "./index/engine";
export { enrichPurpose } from "./index/enrich-purpose";
export { extractAndPersistMetadata, extractFileMetadata } from "./index/extract-metadata";
export { analyzeGitHistory, parseGitLog } from "./index/git-analysis";
export { buildAndPersistImportGraph } from "./index/import-graph";
export { extractImportSpecifiers, resolveImport } from "./index/imports";
export { agglomerativeCluster, buildVocabClusters, cosine, extractVocab } from "./index/vocab-clusters";
export { getWatcherStatus, startWatcher, stopWatcher } from "./index/watcher";
export { deriveIdentityKey } from "./repo/identity";
// Repo
export { getRepo, getRepoStatus, listRepos, registerRepo, removeRepo } from "./repo/repo";
// Telemetry
export { setTelemetryEnabled, track } from "./telemetry";

// Trace
export { RequestTrace, type TraceStep } from "./trace";
// Types
export type {
  Chunk,
  CochangeRow,
  ContextData,
  ContextResponse,
  EmbedResult,
  EnrichResult,
  FileCochange,
  FileImport,
  FileMetadata,
  FileMetadataRow,
  FileStat,
  FileStatRow,
  IndexResult,
  InterpretedQuery,
  RegisterResponse,
  Repo,
  StatusResponse,
  VectorResult,
  VocabCluster,
} from "./types";
