Now I have a complete picture of the Python import handling architecture.

## Report

- **Tool calls**: 10
- **Files read**: 7
- **Key findings**:
  - **`packages/engine/src/index/imports.ts`** — Core import extraction/resolution. Lines 2-3 define `PY_IMPORT_RE` regex for Python. Lines 36-43 `extractPython()` handles `from .xxx import` and `import .xxx`. Lines 96-108 `resolvePython()` resolves relative imports to file paths using `.py` and `/__init__.py` extensions.
  - **`packages/engine/src/index/extract-metadata.ts`** — Metadata extraction. Line 8 defines `PY_EXPORT_RE` for Python exports (`def`/`class`). Line 19 `PY_DOCSTRING_RE` handles triple-quoted docstrings. Calls `extractImportSpecifiers()` from imports.ts at line 229.
  - **`packages/engine/src/index/import-graph.ts`** — Builds import graph using `extractImportSpecifiers()` and `resolveImport()` from imports.ts
  - **`packages/engine/src/index/discovery.ts`** — File discovery. Line 65 maps `.py` → `python`. Line 54 includes `.toml` in docs extensions (for pyproject.toml)
  - **No dependency manifest parsing exists** — LENS only extracts intra-repo imports from `.py` source files. No parsing of `requirements.txt`, `pyproject.toml`, or `uv.lock` for external dependencies. To add uv support, you'd create a new module (e.g., `packages/engine/src/index/deps.ts`) to parse these files, similar pattern to how imports.ts works.
