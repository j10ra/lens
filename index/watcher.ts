import { watch, type FSWatcher } from "chokidar";
import { readFile, stat } from "node:fs/promises";
import { relative, extname } from "node:path";
import { db } from "../repo/db";
import { isBinaryExt, detectLanguage, MAX_FILE_SIZE } from "./discovery";
import { chunkFile, DEFAULT_CHUNKING_PARAMS } from "./chunker";

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
  /(^|[/\\])\../, // dotfiles
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/__pycache__/**",
  "**/target/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/coverage/**",
];

const DEBOUNCE_MS = 500;

async function handleFileChange(repoId: string, repoRoot: string, absPath: string): Promise<void> {
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

  // Get existing chunks for this file
  const existingRows = db.query<{ chunk_index: number; chunk_hash: string; id: string }>`
    SELECT id, chunk_index, chunk_hash FROM chunks
    WHERE repo_id = ${repoId} AND path = ${relPath}
    ORDER BY chunk_index
  `;
  const existing = new Map<string, string>();
  for await (const row of existingRows) {
    existing.set(`${row.chunk_index}:${row.chunk_hash}`, row.id);
  }

  const newKeys = new Set<string>();
  for (const chunk of newChunks) {
    const key = `${chunk.chunk_index}:${chunk.chunk_hash}`;
    newKeys.add(key);

    if (existing.has(key)) {
      await db.exec`
        UPDATE chunks SET last_seen_commit = 'watcher', updated_at = now()
        WHERE id = ${existing.get(key)!} AND repo_id = ${repoId}
      `;
    } else {
      await db.exec`
        INSERT INTO chunks (repo_id, path, chunk_index, start_line, end_line, content, chunk_hash, last_seen_commit, language)
        VALUES (${repoId}, ${relPath}, ${chunk.chunk_index}, ${chunk.start_line}, ${chunk.end_line},
                ${chunk.content}, ${chunk.chunk_hash}, ${'watcher'}, ${language ?? null})
        ON CONFLICT (repo_id, path, chunk_index, chunk_hash) DO UPDATE
          SET last_seen_commit = EXCLUDED.last_seen_commit, updated_at = now()
      `;
    }
  }

  // Delete stale chunks
  for (const [key, id] of existing) {
    if (!newKeys.has(key)) {
      await db.exec`DELETE FROM chunks WHERE id = ${id} AND repo_id = ${repoId}`;
    }
  }

  const entry = watchers.get(repoId);
  if (entry) entry.changedFiles++;
}

async function handleFileDelete(repoId: string, repoRoot: string, absPath: string): Promise<void> {
  const relPath = relative(repoRoot, absPath);
  if (isBinaryExt(relPath)) return;

  await db.exec`DELETE FROM chunks WHERE repo_id = ${repoId} AND path = ${relPath}`;

  const entry = watchers.get(repoId);
  if (entry) entry.deletedFiles++;
}

function debouncedHandler(key: string, fn: () => Promise<void>): void {
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);

  debounceTimers.set(key, setTimeout(() => {
    debounceTimers.delete(key);
    fn().catch(() => {});
  }, DEBOUNCE_MS));
}

export function startWatcher(repoId: string, rootPath: string): { started: boolean; already_watching: boolean } {
  if (watchers.has(repoId)) {
    return { started: false, already_watching: true };
  }

  const fsWatcher = watch(rootPath, {
    ignored: IGNORED,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200 },
    persistent: true,
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

  fsWatcher.on("add", (path) => {
    debouncedHandler(`${repoId}:${path}`, () => handleFileChange(repoId, rootPath, path));
  });

  fsWatcher.on("change", (path) => {
    debouncedHandler(`${repoId}:${path}`, () => handleFileChange(repoId, rootPath, path));
  });

  fsWatcher.on("unlink", (path) => {
    debouncedHandler(`${repoId}:${path}`, () => handleFileDelete(repoId, rootPath, path));
  });

  return { started: true, already_watching: false };
}

export async function stopWatcher(repoId: string): Promise<{ stopped: boolean }> {
  const entry = watchers.get(repoId);
  if (!entry) return { stopped: false };

  await entry.watcher.close();
  watchers.delete(repoId);

  // Clean up any pending debounce timers for this repo
  for (const [key, timer] of debounceTimers) {
    if (key.startsWith(`${repoId}:`)) {
      clearTimeout(timer);
      debounceTimers.delete(key);
    }
  }

  return { stopped: true };
}

export function getWatcherStatus(repoId: string): {
  watching: boolean;
  repo_root: string | null;
  changed_files: number;
  deleted_files: number;
  started_at: string | null;
} {
  const entry = watchers.get(repoId);
  if (!entry) {
    return { watching: false, repo_root: null, changed_files: 0, deleted_files: 0, started_at: null };
  }
  return {
    watching: true,
    repo_root: entry.repoRoot,
    changed_files: entry.changedFiles,
    deleted_files: entry.deletedFiles,
    started_at: entry.startedAt.toISOString(),
  };
}
