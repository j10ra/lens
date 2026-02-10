// DB
export { openDb, getDb, closeDb, getRawDb, type Db } from "./db/connection";

// Types
export type {
  Repo,
  Chunk,
  FileMetadata,
  FileImport,
  FileStat,
  FileCochange,
  IndexResult,
  ContextResponse,
  VocabCluster,
  FileMetadataRow,
  FileStatRow,
  CochangeRow,
  VectorResult,
  InterpretedQuery,
  ContextData,
  EmbedResult,
  EnrichResult,
  RegisterResponse,
  StatusResponse,
} from "./types";

// Capabilities
export type { Capabilities } from "./capabilities";

// Repo
export { registerRepo, getRepo, listRepos, removeRepo, getRepoStatus } from "./repo/repo";
export { deriveIdentityKey } from "./repo/identity";

// Index
export { runIndex, ensureIndexed, computeMaxImportDepth } from "./index/engine";
export { chunkFile, DEFAULT_CHUNKING_PARAMS } from "./index/chunker";
export { fullScan, diffScan, getHeadCommit, detectLanguage, isDocFile, isBinaryExt } from "./index/discovery";
export { extractImportSpecifiers, resolveImport } from "./index/imports";
export { extractFileMetadata, extractAndPersistMetadata } from "./index/extract-metadata";
export { buildAndPersistImportGraph } from "./index/import-graph";
export { analyzeGitHistory, parseGitLog } from "./index/git-analysis";
export { ensureEmbedded } from "./index/embed";
export { enrichPurpose } from "./index/enrich-purpose";
export { buildVocabClusters, extractVocab, cosine, agglomerativeCluster } from "./index/vocab-clusters";
export { startWatcher, stopWatcher, getWatcherStatus } from "./index/watcher";

// Context
export { buildContext } from "./context/context";
export { interpretQuery, isNoisePath } from "./context/query-interpreter";
export { formatContextPack } from "./context/formatter";
export { vectorSearch } from "./context/vector";
export {
  loadFileMetadata,
  getAllFileStats,
  getReverseImports,
  getForwardImports,
  get2HopReverseDeps,
  getCochanges,
  getIndegrees,
  getCochangePartners,
  loadVocabClusters,
} from "./context/structural";

// Query helpers (for advanced usage)
export {
  repoQueries,
  chunkQueries,
  metadataQueries,
  importQueries,
  statsQueries,
  cochangeQueries,
  logQueries,
  usageQueries,
  telemetryQueries,
  type UsageCounter,
} from "./db/queries";

// Telemetry
export { track, setTelemetryEnabled } from "./telemetry";
