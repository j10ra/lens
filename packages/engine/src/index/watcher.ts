import { readFile, stat } from "node:fs/promises";
import { relative } from "node:path";
import { type FSWatcher, watch } from "chokidar";
import type { Db } from "../db/connection";
import { chunkQueries } from "../db/queries";
import { chunkFile, DEFAULT_CHUNKING_PARAMS } from "./chunker";
import { detectLanguage, isBinaryExt, MAX_FILE_SIZE } from "./discovery";

interface WatcherEntry {
  watcher: FSWatcher;
  repoRoot: string;
  repoId: string;
  changedFiles: number;
  deletedFiles: number;
  startedAt: Date;
}

const watchers = new Map<string, WatcherEntry>();
const debounceTimers = new Map<string, NodeJS.Timeout>();

const IGNORED = [
  /(^|[/\\])\../,
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/__pycache__/**",
  "**/target/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/coverage/**",
  "**/.turbo/**",
  "**/out/**",
  "**/.output/**",
  "**/*.log",
  "**/*.lock",
  "**/pnpm-lock.yaml",
  "**/package-lock.json",
  "**/yarn.lock",
];

const DEBOUNCE_MS = 500;

async function handleFileChange(db: Db, repoId: string, repoRoot: string, absPath: string): Promise<void> {
  const relPath = relative(repoRoot, absPath);
  if (isBinaryExt(relPath)) return;

  try {
    const s = await stat(absPath);
    if (s.size > MAX_FILE_SIZE) return;
  } catch {
    return;
  }

  let content: string;
  try {
    content = await readFile(absPath, "utf-8");
  } catch {
    return;
  }

  const language = detectLanguage(relPath);
  const newChunks = chunkFile(content, DEFAULT_CHUNKING_PARAMS);

  const existing = new Map<string, string>();
  for (const row of chunkQueries.getByRepoPath(db, repoId, relPath)) {
    existing.set(`${row.chunk_index}:${row.chunk_hash}`, row.id);
  }

  const newKeys = new Set<string>();
  for (const chunk of newChunks) {
    const key = `${chunk.chunk_index}:${chunk.chunk_hash}`;
    newKeys.add(key);

    if (existing.has(key)) {
      chunkQueries.updateLastSeen(db, existing.get(key)!, repoId, "watcher");
    } else {
      chunkQueries.upsert(
        db,
        repoId,
        relPath,
        chunk.chunk_index,
        chunk.start_line,
        chunk.end_line,
        chunk.content,
        chunk.chunk_hash,
        "watcher",
        language,
      );
    }
  }

  for (const [key, id] of existing) {
    if (!newKeys.has(key)) chunkQueries.deleteById(db, id, repoId);
  }

  const entry = watchers.get(repoId);
  if (entry) entry.changedFiles++;
}

async function handleFileDelete(db: Db, repoId: string, repoRoot: string, absPath: string): Promise<void> {
  const relPath = relative(repoRoot, absPath);
  if (isBinaryExt(relPath)) return;
  chunkQueries.deleteByRepoPath(db, repoId, relPath);
  const entry = watchers.get(repoId);
  if (entry) entry.deletedFiles++;
}

function debouncedHandler(key: string, fn: () => Promise<void>): void {
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key);
      fn().catch(() => {});
    }, DEBOUNCE_MS),
  );
}

export function startWatcher(
  db: Db,
  repoId: string,
  rootPath: string,
): { started: boolean; already_watching: boolean } {
  if (watchers.has(repoId)) return { started: false, already_watching: true };

  try {
    const fsWatcher = watch(rootPath, {
      ignored: IGNORED,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
      persistent: false,
      usePolling: false,
      depth: 5,
    });

    const entry: WatcherEntry = {
      watcher: fsWatcher,
      repoRoot: rootPath,
      repoId,
      changedFiles: 0,
      deletedFiles: 0,
      startedAt: new Date(),
    };
    watchers.set(repoId, entry);

    fsWatcher.on("add", (path) =>
      debouncedHandler(`${repoId}:${path}`, () => handleFileChange(db, repoId, rootPath, path)),
    );
    fsWatcher.on("change", (path) =>
      debouncedHandler(`${repoId}:${path}`, () => handleFileChange(db, repoId, rootPath, path)),
    );
    fsWatcher.on("unlink", (path) =>
      debouncedHandler(`${repoId}:${path}`, () => handleFileDelete(db, repoId, rootPath, path)),
    );
    fsWatcher.on("error", () => {
      stopWatcher(repoId).catch(() => {});
    });

    return { started: true, already_watching: false };
  } catch {
    return { started: false, already_watching: false };
  }
}

export async function stopWatcher(repoId: string): Promise<{ stopped: boolean }> {
  const entry = watchers.get(repoId);
  if (!entry) return { stopped: false };

  await entry.watcher.close();
  watchers.delete(repoId);

  for (const [key, timer] of debounceTimers) {
    if (key.startsWith(`${repoId}:`)) {
      clearTimeout(timer);
      debounceTimers.delete(key);
    }
  }
  return { stopped: true };
}

export function getWatcherStatus(repoId: string) {
  const entry = watchers.get(repoId);
  if (!entry) return { watching: false, repo_root: null, changed_files: 0, deleted_files: 0, started_at: null };
  return {
    watching: true,
    repo_root: entry.repoRoot,
    changed_files: entry.changedFiles,
    deleted_files: entry.deletedFiles,
    started_at: entry.startedAt.toISOString(),
  };
}
