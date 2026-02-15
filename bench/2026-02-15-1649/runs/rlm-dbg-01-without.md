I now have a complete picture of the import extraction logic. Let me trace through the full pipeline and identify the failure points.

## Report

- **Tool calls**: 6
- **Files read**: 5
- **Key findings**:
  1. **Incomplete TS import regex (imports.ts:1)** — The `TS_IMPORT_RE` pattern misses dynamic imports (`import("...")`), `import()` expressions with template literals, and Node.js subpath imports (`#internal/module`). Pattern only captures static `import ... from` and `require()` forms.
  2. **Missing extension variants (imports.ts:6)** — `TS_EXTENSIONS` only includes `.ts`, `.tsx`, `.js`, `.jsx`, `/index.ts`, `/index.js`. Missing: `.mjs`, `.cjs`, `.mts`, `.cts` — files with these extensions won't resolve correctly.
  3. **Language detection gap (imports.ts:9-25)** — The `extractImportSpecifiers` function checks for `"typescript"`, `"javascript"`, `"tsx"`, `"jsx"` but the language map in discovery.ts maps both `.ts` and `.tsx` to `"typescript"` (not `"tsx"` separately). Files with `.mts`/`.cts` would get no language match → empty import array.
  4. **Resolution failure for path aliases (imports.ts:86-94)** — `resolveTS` only handles relative imports (starting with `.`). TypeScript path aliases (`@/utils/logger`) and monorepo workspace imports (`@lens/engine`) are silently dropped, creating no edges.
  5. **Chunk reconstruction ordering (import-graph.ts:10-20)** — File content is reconstructed by concatenating chunks with `\n`. If chunking splits mid-import-statement, the regex may fail to match across chunk boundaries.
  6. **Chunk limit truncation (engine.ts:110)** — When `MAX_CHUNKS_PER_REPO` (100k) is hit, new chunks are silently skipped. The file metadata and import graph still run, but with incomplete content — missing imports from truncated files.
  7. **Language fallback to "text" (import-graph.ts:17)** — If `detectLanguage()` returns null, language defaults to `"text"`, which returns `[]` from `extractImportSpecifiers` — no imports extracted for unrecognized file types.
