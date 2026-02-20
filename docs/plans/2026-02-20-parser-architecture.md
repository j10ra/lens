# Parser Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor scattered language-specific code into a per-language parser architecture with a formal interface, starting with TypeScript.

**Architecture:** Each language gets a directory under `parsers/` implementing `LanguageParser`. A registry dispatches by language string. Shared utilities (path normalization, universal patterns) live in `parsers/common/`. Callers (`extract-metadata.ts`, `import-graph.ts`) use the registry instead of switch statements.

**Tech Stack:** TypeScript, regex-based parsing, Drizzle ORM (unchanged)

**Design doc:** `docs/plans/2026-02-20-parser-architecture-design.md`

---

### Task 1: Create LanguageParser interface and registry

**Files:**
- Create: `packages/engine/src/parsers/types.ts`
- Create: `packages/engine/src/parsers/registry.ts`

**Step 1: Create the interface**

Create `packages/engine/src/parsers/types.ts`:

```ts
export interface LanguageParser {
  /** Language identifiers this parser handles (e.g. ["typescript", "javascript", "tsx", "jsx"]) */
  languages: string[]

  extractImports(content: string): string[]
  extractExports(content: string): string[]
  extractDocstring(content: string): string
  extractSections(content: string): string[]
  extractInternals(content: string, exports: string[]): string[]
  resolveImport(specifier: string, sourcePath: string, knownPaths: Set<string>): string | null
}
```

**Step 2: Create the registry**

Create `packages/engine/src/parsers/registry.ts`:

```ts
import type { LanguageParser } from "./types.js"

const parsers = new Map<string, LanguageParser>()

export function registerParser(parser: LanguageParser): void {
  for (const lang of parser.languages) {
    parsers.set(lang, parser)
  }
}

export function getParser(language: string | null): LanguageParser | null {
  return parsers.get(language ?? "") ?? null
}
```

Note: parsers will self-register via side-effect imports in Task 4.

**Step 3: Verify types compile**

Run: `npx tsc --noEmit --project packages/engine/tsconfig.json`
Expected: no errors

**Step 4: Commit**

```
feat(engine): add LanguageParser interface and registry
```

---

### Task 2: Create common utilities

**Files:**
- Create: `packages/engine/src/parsers/common/resolve.ts`
- Create: `packages/engine/src/parsers/common/patterns.ts`

**Step 1: Move path resolution helpers to common**

Create `packages/engine/src/parsers/common/resolve.ts`. Extract from `imports.ts:98-105`:

```ts
export function normalizePosix(p: string): string {
  const parts: string[] = []
  for (const seg of p.split("/")) {
    if (seg === "..") parts.pop()
    else if (seg !== "." && seg !== "") parts.push(seg)
  }
  return parts.join("/")
}
```

**Step 2: Move universal patterns to common**

Create `packages/engine/src/parsers/common/patterns.ts`. Extract section extraction from `extract-metadata.ts:138-157` and universal internals from `extract-metadata.ts:161-228`:

```ts
// ── Section extraction (language-agnostic) ────────────────────────────
const SECTION_SINGLE_RE = /^(?:\/\/|#)\s*[-=]{3,}\s*(.+?)\s*[-=]{3,}\s*$/gm
const SECTION_BLOCK_RE = /^\/\*\s*[-=]{3,}\s*(.+?)\s*[-=]{3,}\s*\*\/$/gm

export function extractSections(content: string): string[] {
  const seen = new Set<string>()
  const sections: string[] = []

  for (const re of [SECTION_SINGLE_RE, SECTION_BLOCK_RE]) {
    const pattern = new RegExp(re.source, re.flags)
    for (const m of content.matchAll(pattern)) {
      const label = m[1]?.trim()
      if (label && !seen.has(label)) {
        seen.add(label)
        sections.push(label)
      }
    }
  }

  return sections.slice(0, 15)
}

// ── Internals extraction (universal declarations) ─────────────────────
const UNIVERSAL_DECL_RES: RegExp[] = [
  /^\s*(?:async\s+)?(?:function|def|fn|func|fun)\s+(\w+)/gm,
  /^\s*(?:const|let|var|val)\s+(\w+)\s*[=:]/gm,
  /^\s*(?:abstract\s+|sealed\s+|partial\s+|data\s+)?(?:class|struct|enum|trait|interface|record|object|mod)\s+(\w+)/gm,
  /^\s*type\s+(\w+)\s*[=<{]/gm,
]

const EXPORT_LINE_RE = /^(?:export|pub\s|public\s)/
const SKIP_NAMES = new Set([
  "if", "for", "foreach", "while", "switch", "using", "catch", "lock",
  "return", "throw", "yield", "try", "do", "else", "new", "await",
  "base", "this", "super", "self", "import", "require", "from", "package",
])

export function extractUniversalInternals(content: string, exports: string[]): string[] {
  const exportSet = new Set(exports)
  const seen = new Set<string>()
  const results: string[] = []

  for (const line of content.split("\n")) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue
    if (trimmed.startsWith("#") && !trimmed.startsWith("#!")) continue
    if (EXPORT_LINE_RE.test(trimmed)) continue

    for (const re of UNIVERSAL_DECL_RES) {
      const pattern = new RegExp(re.source, re.flags)
      for (const m of line.matchAll(pattern)) {
        const name = m[1]
        if (
          name &&
          name.length >= 3 &&
          !exportSet.has(name) &&
          !seen.has(name) &&
          !SKIP_NAMES.has(name) &&
          !name.startsWith("_")
        ) {
          seen.add(name)
          results.push(name)
        }
      }
    }
  }

  return results.slice(0, 20)
}
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit --project packages/engine/tsconfig.json`
Expected: no errors

**Step 4: Commit**

```
feat(engine): add common parser utilities (resolve, patterns)
```

---

### Task 3: Create TypeScript parser

**Files:**
- Create: `packages/engine/src/parsers/typescript/imports.ts`
- Create: `packages/engine/src/parsers/typescript/exports.ts`
- Create: `packages/engine/src/parsers/typescript/resolve.ts`
- Create: `packages/engine/src/parsers/typescript/index.ts`

**Step 1: Create TS import extraction**

Create `packages/engine/src/parsers/typescript/imports.ts`. Extract from current `imports.ts:4-7,46-57`:

```ts
const TS_STATIC_RE = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g
const TS_DYNAMIC_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const TS_REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const TS_EXPORT_RE = /export\s+(?:.*?\s+from\s+)['"]([^'"]+)['"]/g

export function extractImports(content: string): string[] {
  const specs = new Set<string>()
  for (const re of [TS_STATIC_RE, TS_DYNAMIC_RE, TS_REQUIRE_RE, TS_EXPORT_RE]) {
    re.lastIndex = 0
    for (const m of content.matchAll(re)) {
      const spec = m[1]
      if (spec.startsWith(".")) specs.add(spec)
    }
  }
  return [...specs]
}
```

**Step 2: Create TS export extraction**

Create `packages/engine/src/parsers/typescript/exports.ts`. Extract from `extract-metadata.ts:6-7,20-28`:

```ts
const TS_EXPORT_RE =
  /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|enum|namespace)\s+(\w+)/gm

export function extractExports(content: string): string[] {
  const result: string[] = []
  for (const m of content.matchAll(new RegExp(TS_EXPORT_RE.source, "gm"))) {
    if (m[1] && !result.includes(m[1])) result.push(m[1])
  }
  return result.slice(0, 30)
}
```

**Step 3: Create TS import resolution**

Create `packages/engine/src/parsers/typescript/resolve.ts`. Extract from `imports.ts:20,112-135` with the `.js` stripping fix:

```ts
import * as path from "node:path"
import { normalizePosix } from "../common/resolve.js"

const TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"]

export function resolveImport(
  specifier: string,
  sourceFilePath: string,
  knownPaths: Set<string>,
): string | null {
  if (!specifier.startsWith(".")) return null

  const dir = path.posix.dirname(sourceFilePath)
  const base = normalizePosix(`${dir}/${specifier}`)

  if (knownPaths.has(base)) return base

  // Strip .js/.jsx/.mjs -- TS emits .js imports but source files are .ts
  const stripped = base.replace(/\.(js|jsx|mjs)$/, "")

  for (const ext of TS_EXTENSIONS) {
    const candidate = stripped + ext
    if (knownPaths.has(candidate)) return candidate
  }

  return null
}
```

**Step 4: Create TypeScriptParser implementation**

Create `packages/engine/src/parsers/typescript/index.ts`:

```ts
import { extractSections, extractUniversalInternals } from "../common/patterns.js"
import type { LanguageParser } from "../types.js"
import { extractExports } from "./exports.js"
import { extractImports } from "./imports.js"
import { resolveImport } from "./resolve.js"

const JSDOC_RE = /^\/\*\*\s*([\s\S]*?)\*\//m

function extractDocstring(content: string): string {
  const m = content.match(JSDOC_RE)
  if (!m) return ""
  return m[1]?.replace(/\s*\*\s*/g, " ").trim().slice(0, 200) ?? ""
}

export const typescriptParser: LanguageParser = {
  languages: ["typescript", "javascript", "tsx", "jsx"],
  extractImports,
  extractExports,
  extractDocstring,
  extractSections,
  extractInternals: extractUniversalInternals,
  resolveImport,
}
```

**Step 5: Verify types compile**

Run: `npx tsc --noEmit --project packages/engine/tsconfig.json`
Expected: no errors

**Step 6: Commit**

```
feat(engine): add TypeScript parser implementing LanguageParser
```

---

### Task 4: Wire registry and update callers

**Files:**
- Modify: `packages/engine/src/parsers/registry.ts` (add auto-registration)
- Modify: `packages/engine/src/index/extract-metadata.ts` (use registry)
- Modify: `packages/engine/src/index/import-graph.ts` (use registry)

**Step 1: Add auto-registration to registry**

Add to bottom of `packages/engine/src/parsers/registry.ts`:

```ts
// ── Auto-register all parsers ────────────────────────────────────────
import { typescriptParser } from "./typescript/index.js"

registerParser(typescriptParser)
```

**Step 2: Rewrite extract-metadata.ts as thin dispatcher**

Replace the entire `packages/engine/src/index/extract-metadata.ts` with:

```ts
import type { Db } from "../db/connection.js"
import { metadataQueries } from "../db/queries.js"
import { extractSections, extractUniversalInternals } from "../parsers/common/patterns.js"
import { getParser } from "../parsers/registry.js"

export interface FileMetadata {
  path: string
  language: string | null
  exports: string[]
  imports: string[]
  docstring: string
  sections: string[]
  internals: string[]
}

export function extractFileMetadata(content: string, path: string, language: string | null): FileMetadata {
  const parser = getParser(language)
  const exports = parser?.extractExports(content) ?? []

  return {
    path,
    language,
    exports,
    imports: parser?.extractImports(content) ?? [],
    docstring: parser?.extractDocstring(content) ?? "",
    sections: parser?.extractSections(content) ?? extractSections(content),
    internals: parser?.extractInternals(content, exports) ?? extractUniversalInternals(content, exports),
  }
}

export function extractAndPersistMetadata(
  db: Db,
  repoId: string,
  fileContents: Map<string, { content: string; language: string | null }>,
): number {
  let count = 0
  for (const [path, { content, language }] of fileContents) {
    const meta = extractFileMetadata(content, path, language)
    metadataQueries.upsert(db, repoId, path, {
      language: meta.language,
      exports: meta.exports,
      imports: meta.imports,
      docstring: meta.docstring,
      sections: meta.sections,
      internals: meta.internals,
    })
    count++
  }
  return count
}
```

**Step 3: Update import-graph.ts to use parser registry**

Replace `packages/engine/src/index/import-graph.ts`:

```ts
import type { Db } from "../db/connection.js"
import { importQueries, metadataQueries } from "../db/queries.js"
import { getParser } from "../parsers/registry.js"

export function buildAndPersistImportGraph(db: Db, repoId: string): void {
  importQueries.clearForRepo(db, repoId)

  const allMeta = metadataQueries.getAllForRepo(db, repoId)
  const knownPaths = new Set(allMeta.map((m) => m.path))

  const edges: Array<{ sourcePath: string; targetPath: string }> = []
  const seen = new Set<string>()

  for (const meta of allMeta) {
    const parser = getParser(meta.language)
    if (!parser) continue

    const specifiers: string[] = JSON.parse(meta.imports ?? "[]")
    for (const spec of specifiers) {
      const targetPath = parser.resolveImport(spec, meta.path, knownPaths)
      if (!targetPath || targetPath === meta.path) continue

      const edgeKey = `${meta.path}\0${targetPath}`
      if (!seen.has(edgeKey)) {
        seen.add(edgeKey)
        edges.push({ sourcePath: meta.path, targetPath })
      }
    }
  }

  if (edges.length > 0) {
    importQueries.insertEdges(db, repoId, edges)
  }
}
```

**Step 4: Verify types compile**

Run: `npx tsc --noEmit --project packages/engine/tsconfig.json`
Expected: no errors

**Step 5: Commit**

```
refactor(engine): wire parser registry into extract-metadata and import-graph
```

---

### Task 5: Delete dead code

**Files:**
- Delete: `packages/engine/src/index/chunker.ts`
- Delete: `packages/engine/src/index/imports.ts`
- Verify: no remaining imports of either file

**Step 1: Verify no imports of chunker.ts**

Run: `grep -r "chunker" packages/engine/src/ --include="*.ts"`
Expected: no matches (already confirmed dead)

**Step 2: Verify no imports of imports.ts**

Run: `grep -r "from.*imports\\.js\|from.*imports\"" packages/engine/src/ --include="*.ts"`
Expected: no matches (import-graph.ts now uses registry)

**Step 3: Delete dead files**

```bash
rm packages/engine/src/index/chunker.ts
rm packages/engine/src/index/imports.ts
```

**Step 4: Build and type check**

Run: `pnpm --filter @lens/engine build && npx tsc --noEmit --project packages/engine/tsconfig.json`
Expected: clean build, no errors

**Step 5: Commit**

```
chore(engine): delete dead chunker.ts and imports.ts
```

---

### Task 6: Integration verification

**Files:** None (testing only)

**Step 1: Build full stack**

Run: `pnpm --filter @lens/engine build && pnpm --filter @lens/daemon build`
Expected: both build clean

**Step 2: Restart daemon and force re-index**

```bash
# Kill existing daemon, start fresh
lsof -i :4111 -t | xargs kill 2>/dev/null
node apps/daemon/dist/index.js &
sleep 2

# Reset git analysis to get full data
sqlite3 ~/.lens/index.db "UPDATE repos SET last_git_analysis_commit = NULL;"

# Force re-index
curl -s -X POST 'http://localhost:4111/api/repos/640fbd21-00a6-48ee-89ca-9c86cb8f088b/index' \
  -H 'Content-Type: application/json' -d '{"force":true}'
```

Expected: `files_scanned: 160`, `skipped: false`

**Step 3: Verify import edges populated**

```bash
sqlite3 ~/.lens/index.db "SELECT COUNT(*) FROM file_imports;"
```

Expected: ~122 edges (same as before refactor)

**Step 4: Verify git stats populated**

```bash
sqlite3 ~/.lens/index.db "SELECT COUNT(*) FROM file_stats;"
sqlite3 ~/.lens/index.db "SELECT COUNT(*) FROM file_cochanges;"
```

Expected: ~314 stats, ~309 cochanges (same as before refactor)

**Step 5: Verify file detail API**

```bash
curl -s 'http://localhost:4111/api/repos/640fbd21-00a6-48ee-89ca-9c86cb8f088b/files/packages%2Fcore%2Fsrc%2Ftrace-store.ts' | python3 -c "
import json,sys
d = json.load(sys.stdin)
assert len(d['import_edges']) > 0, 'no import edges'
assert len(d['imported_by']) > 0, 'no importers'
assert d['git_stats'] is not None, 'no git stats'
print('OK: import_edges={} imported_by={} commits={} cochanges={}'.format(
  len(d['import_edges']), len(d['imported_by']),
  d['git_stats']['commit_count'], len(d['cochanges'])))
"
```

Expected: `OK: import_edges=1 imported_by=4 commits=2 cochanges=1`

**Step 6: Commit**

```
test(engine): verify parser refactor produces identical index data
```
