Now I have the complete picture. Let me summarize the parser extension points for Python support.

---

## Python Parser Extension Points

### 1. **Create New Parser Module** 
`packages/engine/src/parsers/python/index.ts`

Export a `pythonParser: LanguageParser` object with:
- `languages: ["python"]` — matches `"python"` from `LANG_MAP[".py"]`
- `extractImports` — Python import patterns (`import x`, `from x import y`)
- `extractExports` — Python public symbols (no explicit exports; convention-based)
- `extractDocstring` — Python docstrings (`"""..."""` or `'''...'''`)
- `extractSections` — Can reuse `extractSections` from common/patterns.ts (already supports `# ---` comments)
- `extractInternals` — Can reuse `extractUniversalInternals` (already supports `def`, `class`)
- `extractSymbols` — Optional but valuable; would need regex or AST (e.g., tree-sitter)
- `resolveImport` — Python path resolution (`.py`, `/__init__.py`)

### 2. **Create Implementation Files**
`packages/engine/src/parsers/python/imports.ts`
```typescript
// Regex patterns for:
// - import foo
// - import foo.bar  
// - from foo import bar
// - from .foo import bar (relative)
// - from ..foo import bar
```

`packages/engine/src/parsers/python/exports.ts`
```typescript
// Python has no explicit exports — everything public (no leading _)
// Could extract all top-level class/function names that don't start with _
// Or parse __all__ variable
```

`packages/engine/src/parsers/python/resolve.ts`
```typescript
// Resolution rules:
// - .foo → ./foo.py or ./foo/__init__.py
// - ..foo → ../foo.py or ../foo/__init__.py
// - Handle namespace packages
```

`packages/engine/src/parsers/python/docstring.ts` (or inline in index.ts)
```typescript
// Extract module-level docstring: first """...""" or '''...'''
```

`packages/engine/src/parsers/python/symbols.ts` (optional)
```typescript
// Rich symbol extraction: functions, classes, methods
// Would need regex or tree-sitter for accuracy
```

### 3. **Register Parser**
`packages/engine/src/parsers/registry.ts:16-18`
```typescript
import { pythonParser } from "./python/index.js";
registerParser(pythonParser);
```

### 4. **Extend SymbolKind (if needed)**
`packages/engine/src/parsers/types.ts:1-11`

Current kinds: `function | class | interface | type | enum | namespace | const | let | var | method`

For Python, may want to add:
- `module` — for `__all__` entries
- Python already covered by existing kinds (function, class, method)

### 5. **No Changes Needed**
- `discovery.ts:59` — Already maps `.py` → `"python"`
- `extract-metadata.ts` — Uses `getParser(language)` dynamically
- `import-graph.ts` — Uses `parser.resolveImport()` dynamically
- `common/patterns.ts` — `extractSections` already supports `# ---` style
- `extractUniversalInternals` — Already matches `def`, `class` patterns

---

## Summary

| File | Action | Effort |
|------|--------|--------|
| `parsers/python/index.ts` | **Create** — parser object definition | Low |
| `parsers/python/imports.ts` | **Create** — regex for Python imports | Low |
| `parsers/python/exports.ts` | **Create** — convention-based exports | Medium |
| `parsers/python/resolve.ts` | **Create** — `.py` and `__init__.py` resolution | Medium |
| `parsers/python/docstring.ts` | **Create** — or inline in index.ts | Low |
| `parsers/python/symbols.ts` | **Create** (optional) — richer AST extraction | Medium-High |
| `parsers/registry.ts` | **Edit** — add 2 lines to register | Trivial |
| `parsers/types.ts` | Maybe **Edit** — add `module` kind | Optional |

**Key insight**: The parser architecture is clean plugin-based. Adding Python requires ~5 new files + 1 registry edit. No changes to discovery, indexing, or import-graph logic — they're language-agnostic via the `LanguageParser` interface.

---

## Report

- **Tool calls**: 12
- **Tools used**: ToolSearch, Glob, Grep, Read
- **Files read**: 11
- **Files used**: 
  - `packages/engine/src/parsers/registry.ts`
  - `packages/engine/src/parsers/types.ts`
  - `packages/engine/src/parsers/typescript/index.ts`
  - `packages/engine/src/parsers/typescript/imports.ts`
  - `packages/engine/src/parsers/typescript/exports.ts`
  - `packages/engine/src/parsers/typescript/resolve.ts`
  - `packages/engine/src/parsers/typescript/symbols.ts`
  - `packages/engine/src/parsers/common/patterns.ts`
  - `packages/engine/src/parsers/common/resolve.ts`
  - `packages/engine/src/index/import-graph.ts`
  - `packages/engine/src/index/extract-metadata.ts`
  - `packages/engine/src/index/discovery.ts`
- **Key findings**:
  - **Plugin architecture**: `LanguageParser` interface defines 7 methods; registry auto-discovers parsers
  - **Python already detected**: `LANG_MAP[".py"] = "python"` in discovery.ts
  - **Shared utilities**: `extractSections` and `extractUniversalInternals` are language-agnostic, support Python syntax already
  - **Resolution pattern**: TypeScript parser shows the model — extension mapping (`.ts`, `/index.ts`) needed for Python (`.py`, `/__init__.py`)
  - **Zero core changes**: No modifications to indexing, metadata extraction, or import graph — they're polymorphic via `getParser(language)`
