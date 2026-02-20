# Per-Language Parser Architecture

## Problem

Language-specific code (import extraction, export extraction, docstrings, import resolution) is scattered across `extract-metadata.ts` and `imports.ts` as switch statements and regex blocks. Adding a new language means editing multiple files. No enforced contract — easy to miss a method.

## Design

### Interface

```ts
interface LanguageParser {
  languages: string[]
  extractImports(content: string): string[]
  extractExports(content: string): string[]
  extractDocstring(content: string): string
  extractSections(content: string): string[]
  extractInternals(content: string, exports: string[]): string[]
  resolveImport(specifier: string, sourcePath: string, knownPaths: Set<string>): string | null
}
```

### Directory Structure

```
packages/engine/src/parsers/
  types.ts                    -- LanguageParser interface
  registry.ts                 -- getParser(lang), auto-registers all parsers
  common/
    resolve.ts                -- normalizePosix(), stripJsExtension()
    patterns.ts               -- universal internals regex, section extraction
  typescript/
    index.ts                  -- TypeScriptParser implements LanguageParser
    imports.ts                -- TS/JS import regex
    exports.ts                -- TS/JS export regex
    resolve.ts                -- .js->.ts mapping, TS_EXTENSIONS, /index resolution
```

### Registry

```ts
const parsers = new Map<string, LanguageParser>()

function registerParser(parser: LanguageParser): void
function getParser(language: string | null): LanguageParser | null
```

Returns `null` for unknown languages. Callers decide what to skip vs fallback.

### Migration

| Current | Destination |
|---------|-------------|
| `extract-metadata.ts` TS export/import/docstring regex | `parsers/typescript/` |
| `extract-metadata.ts` PY/GO/RUST/CSHARP/JAVA patterns | Deleted (re-add when targeting) |
| `imports.ts` TS extraction + TS_EXTENSIONS | `parsers/typescript/imports.ts` + `resolve.ts` |
| `imports.ts` normalizePosix, extension stripping | `parsers/common/resolve.ts` |
| `extract-metadata.ts` universal internals regex | `parsers/common/patterns.ts` |
| `extract-metadata.ts` section extraction | `parsers/common/patterns.ts` |
| `chunker.ts` | Deleted (dead code) |

### Caller Changes

`extract-metadata.ts` becomes a thin dispatcher:
- Calls `getParser(language)` for language-specific extraction
- Falls back to common patterns for internals/sections when no parser

`import-graph.ts` uses parser for resolution:
- `getParser(meta.language)?.resolveImport(spec, path, knownPaths)`
- Skips files with no parser (no import edges for unknown languages)

### Unchanged

- `discovery.ts` -- extension-to-language map stays (used before parsing)
- `git-analysis.ts` -- no language awareness
- `grep/` -- operates on pre-extracted metadata
- `engine.ts` -- orchestration only

## Adding a New Language (e.g. C#)

1. Create `parsers/csharp/index.ts` implementing `LanguageParser`
2. Register in `parsers/registry.ts`
3. Done -- no other files need changes
