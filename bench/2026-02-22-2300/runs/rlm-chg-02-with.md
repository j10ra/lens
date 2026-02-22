Boss, here's the complete mapping of parser extension points for adding Python support:

## Extension Points

### 1. **Create New Parser Directory** (Required)
```
packages/engine/src/parsers/python/
├── index.ts      ← Main parser object, docstring extractor
├── imports.ts    ← Python import regex patterns
├── exports.ts    ← Python export patterns (if any)
├── resolve.ts    ← Python import resolution logic
└── symbols.ts    ← Optional: AST-based symbol extraction
```

### 2. **LanguageParser Interface** (`types.ts:20-32`)
Must implement all methods:
```typescript
interface LanguageParser {
  languages: string[];              // ["python", "py"]
  extractImports(content): string[];
  extractExports(content): string[];
  extractDocstring(content): string;
  extractSections(content): string[];
  extractInternals(content, exports): string[];
  extractSymbols?(content): ParsedSymbol[];  // Optional
  resolveImport(specifier, sourcePath, knownPaths): string | null;
}
```

### 3. **Register Parser** (`registry.ts:16-18`)
Add auto-import and registration:
```typescript
import { pythonParser } from "./python/index.js";
registerParser(pythonParser);
```

### 4. **Already Supported** (`discovery.ts:59`)
Python already in `LANG_MAP` — `".py": "python"` maps extension → language ID.

---

## Python-Specific Implementation Notes

| Method | Python Pattern |
|--------|----------------|
| `extractImports` | `import X`, `from X import Y`, `from . import Z` |
| `extractExports` | Python has no explicit exports — all top-level is public. Return `[]` or extract `__all__` list |
| `extractDocstring` | Match `"""docstring"""` at module top (PEP 257) |
| `extractSections` | Already language-agnostic — handles `# --- Label ---` |
| `extractInternals` | Already handles `def` and `class` — may work as-is |
| `resolveImport` | Handle `.` → `__init__.py`, bare imports → knownPaths, no extension stripping |
| `extractSymbols` | Optional. Could use regex or tree-sitter-python for richer data |

---

## Files to Modify

| File | Change |
|------|--------|
| `parsers/types.ts` | No change (interface already generic) |
| `parsers/registry.ts` | Add import + register call |
| `parsers/python/index.ts` | **NEW** — assemble parser object |
| `parsers/python/imports.ts` | **NEW** — Python import regex |
| `parsers/python/exports.ts` | **NEW** — `__all__` extraction or empty |
| `parsers/python/resolve.ts` | **NEW** — `__init__.py`, relative imports |
| `parsers/python/symbols.ts` | **NEW** (optional) — class/function extraction |
| `index/discovery.ts` | Already has `.py` → `python` |

---

## Key Architecture Insight

The system is **registry-based** — `getParser(language)` is called by:
- `extract-metadata.ts:extractFileMetadata()` — uses parser for file analysis
- `import-graph.ts:buildAndPersistImportGraph()` — uses `resolveImport()`

No other code paths need changes. Just implement the interface, register it.

---

## Report

- **Tool calls**: 9
- **Tools used**: ToolSearch, Glob, mcp__lens__lens_grep, Read
- **Files read**: 9
- **Files used**: `packages/engine/src/parsers/types.ts`, `packages/engine/src/parsers/registry.ts`, `packages/engine/src/parsers/typescript/index.ts`, `packages/engine/src/parsers/typescript/imports.ts`, `packages/engine/src/parsers/typescript/exports.ts`, `packages/engine/src/parsers/typescript/resolve.ts`, `packages/engine/src/parsers/typescript/symbols.ts`, `packages/engine/src/parsers/common/patterns.ts`, `packages/engine/src/index/discovery.ts`
- **Key findings**:
  - Registry pattern: `registerParser()` maps language IDs → parser instances
  - LanguageParser interface requires 7 methods (1 optional)
  - `discovery.ts` already maps `.py` → `python`
  - Common patterns already support Python `def`/`class` and `# ---` sections
  - Symbols extraction is optional; regex-based extraction works for basic needs
  - Import resolution is the most Python-specific logic (`__init__.py`, relative imports)
