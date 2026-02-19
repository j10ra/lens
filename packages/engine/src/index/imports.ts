import * as path from "node:path";

// TypeScript/JavaScript import patterns
const TS_STATIC_RE = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
const TS_DYNAMIC_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const TS_REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const TS_EXPORT_RE = /export\s+(?:.*?\s+from\s+)['"]([^'"]+)['"]/g;

// Python import patterns
const PY_FROM_RE = /^from\s+(\S+)\s+import/gm;
const PY_IMPORT_RE = /^import\s+(\S+)/gm;

// Go import patterns (inside import blocks or single imports)
const GO_IMPORT_RE = /"([^"]+)"/g;

// Rust use/mod patterns
const RUST_USE_RE = /use\s+((?:crate|super|self)::[\w:]+)/g;
const RUST_MOD_RE = /\bmod\s+(\w+)\s*;/g;

const TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];
const PY_EXTENSIONS = [".py", "/__init__.py"];

/** Returns raw import specifiers from source content. Internal helper — not lensFn-wrapped. */
export function extractImportSpecifiers(content: string, language: string | null): string[] {
  switch (language) {
    case "typescript":
    case "typescriptreact":
    case "javascript":
    case "javascriptreact":
    // v1 compat aliases
    case "tsx":
    case "jsx":
      return extractTS(content);
    case "python":
      return extractPython(content);
    case "go":
      return extractGo(content);
    case "rust":
      return extractRust(content);
    default:
      // Unknown language — try TS/JS patterns (most common in target repos)
      return extractTS(content);
  }
}

function extractTS(content: string): string[] {
  const specs = new Set<string>();
  for (const re of [TS_STATIC_RE, TS_DYNAMIC_RE, TS_REQUIRE_RE, TS_EXPORT_RE]) {
    re.lastIndex = 0;
    for (const m of content.matchAll(re)) {
      const spec = m[1];
      // Keep only relative imports (starting with . or ..)
      if (spec.startsWith(".")) specs.add(spec);
    }
  }
  return [...specs];
}

function extractPython(content: string): string[] {
  const specs = new Set<string>();
  PY_FROM_RE.lastIndex = 0;
  PY_IMPORT_RE.lastIndex = 0;
  for (const m of content.matchAll(PY_FROM_RE)) {
    const spec = m[1];
    if (spec?.startsWith(".")) specs.add(spec);
  }
  for (const m of content.matchAll(PY_IMPORT_RE)) {
    const spec = m[1];
    if (spec?.startsWith(".")) specs.add(spec);
  }
  return [...specs];
}

function extractGo(content: string): string[] {
  // Go imports are module paths, not relative — skip for now (no relative imports in Go)
  const specs: string[] = [];
  GO_IMPORT_RE.lastIndex = 0;
  for (const m of content.matchAll(GO_IMPORT_RE)) {
    // Only include if it contains "/" (module path) — relative ./ not used in Go
    if (m[1].includes("/")) specs.push(m[1]);
  }
  return specs;
}

function extractRust(content: string): string[] {
  const specs = new Set<string>();
  RUST_USE_RE.lastIndex = 0;
  RUST_MOD_RE.lastIndex = 0;
  for (const m of content.matchAll(RUST_USE_RE)) {
    specs.add(m[1]);
  }
  for (const m of content.matchAll(RUST_MOD_RE)) {
    specs.add(`self::${m[1]}`);
  }
  return [...specs];
}

function normalizePosix(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join("/");
}

/**
 * Resolves a relative import specifier to a repo-relative file path.
 * Tries multiple extensions in order. Returns null if unresolvable.
 * Internal helper — not lensFn-wrapped.
 */
export function resolveImport(specifier: string, sourceFilePath: string, knownPaths: Set<string>): string | null {
  // Go and Rust use module paths, not relative specifiers resolvable by path
  // Relative specifiers start with . or ..
  if (!specifier.startsWith(".")) return null;

  const dir = path.posix.dirname(sourceFilePath);
  const base = normalizePosix(`${dir}/${specifier}`);

  // Try exact match first
  if (knownPaths.has(base)) return base;

  // Try with extensions
  for (const ext of TS_EXTENSIONS) {
    const candidate = base + ext;
    if (knownPaths.has(candidate)) return candidate;
  }

  for (const ext of PY_EXTENSIONS) {
    const candidate = base + ext;
    if (knownPaths.has(candidate)) return candidate;
  }

  return null;
}
