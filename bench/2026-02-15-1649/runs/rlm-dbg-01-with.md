Now I have a complete picture. Let me analyze the potential failure points.

## Report

- **Tool calls**: 4
- **Files read**: 4
- **Key findings**:
  1. **TS_IMPORT_RE regex limitation** (`imports.ts:1`) — The regex `(?:import\s+.*?from\s+|import\s+|export\s+.*?from\s+|require\s*\()['"]([^'"]+)['"]` only captures imports starting with `.` (line 31). This misses:
     - Aliased imports: `import * as foo from "./bar"`
     - Bare imports without quotes in correct position
     - Dynamic imports: `import("./bar")` or `await import("./bar")`
     - Re-exports: `export { foo } from "./bar"`
  
  2. **Language detection fallback chain** (`import-graph.ts:17`) — Language is set via `row.language ?? detectLanguage(row.path) ?? "text"`. If `row.language` is `null` and `detectLanguage()` returns `null` for edge cases (e.g., `.mjs`, `.cjs`, `.mts`, `.cts` extensions), the file falls through to `default:` in `extractImportSpecifiers` and returns empty array.
  
  3. **Missing extensions in resolution** (`imports.ts:6`) — `TS_EXTENSIONS` only includes `.ts`, `.tsx`, `.js`, `.jsx`, `/index.ts`, `/index.js`. Missing:
     - `.mjs`, `.cjs` (ESM/CommonJS modules)
     - `.mts`, `.cts` (TypeScript ESM/CommonJS)
     - `.json` (JSON imports)
     - No `.d.ts` for type-only imports
  
  4. **Chunked content reconstruction** (`import-graph.ts:10-20`) — Files are reconstructed from chunks with `\n` separators. If an import statement spans a chunk boundary, the regex won't match across the artificial newline insertion point.
  
  5. **Path normalization edge case** (`imports.ts:137-144`) — `normalizePath()` strips empty segments, which can cause mismatches when resolving paths like `./src/../utils` vs `./utils` against `knownPaths` that were stored with different normalization.
