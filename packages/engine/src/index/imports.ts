const TS_IMPORT_RE = /(?:import\s+.*?from\s+|import\s+|export\s+.*?from\s+|require\s*\()['"]([^'"]+)['"]/g;
const PY_IMPORT_RE = /^(?:from\s+(\.[\w.]*)\s+import|import\s+([\w.]+))/gm;
const GO_IMPORT_RE = /import\s+(?:\(\s*)?(?:[\w.]*\s+)?"([^"]+)"/g;
const RUST_USE_RE = /use\s+((?:crate|super|self)::[\w:]+)/g;

const TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js"];
const PY_EXTENSIONS = [".py", "/__init__.py"];

export function extractImportSpecifiers(content: string, language: string): string[] {
  switch (language) {
    case "typescript":
    case "javascript":
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
      return [];
  }
}

function extractTS(content: string): string[] {
  const specs: string[] = [];
  for (const m of content.matchAll(TS_IMPORT_RE)) {
    const spec = m[1];
    if (spec.startsWith(".")) specs.push(spec);
  }
  return specs;
}

function extractPython(content: string): string[] {
  const specs: string[] = [];
  for (const m of content.matchAll(PY_IMPORT_RE)) {
    const spec = m[1] ?? m[2];
    if (spec?.startsWith(".")) specs.push(spec);
  }
  return specs;
}

function extractGo(content: string): string[] {
  const specs: string[] = [];
  for (const m of content.matchAll(GO_IMPORT_RE)) {
    if (m[1].includes("/")) specs.push(m[1]);
  }
  return specs;
}

function extractRust(content: string): string[] {
  const specs: string[] = [];
  for (const m of content.matchAll(RUST_USE_RE)) {
    specs.push(m[1]);
  }
  return specs;
}

export function resolveImport(
  importerPath: string,
  specifier: string,
  language: string,
  knownPaths: Set<string>,
): string | null {
  const dir = importerPath.substring(0, importerPath.lastIndexOf("/"));

  switch (language) {
    case "typescript":
    case "javascript":
    case "tsx":
    case "jsx":
      return resolveTS(dir, specifier, knownPaths);
    case "python":
      return resolvePython(dir, specifier, knownPaths);
    case "go":
      return resolveGo(specifier, knownPaths);
    case "rust":
      return resolveRust(dir, specifier, knownPaths);
    default:
      return null;
  }
}

function resolveTS(dir: string, spec: string, known: Set<string>): string | null {
  const base = normalizePath(`${dir}/${spec}`);
  for (const ext of TS_EXTENSIONS) {
    const candidate = base + ext;
    if (known.has(candidate)) return candidate;
  }
  if (known.has(base)) return base;
  return null;
}

function resolvePython(dir: string, spec: string, known: Set<string>): string | null {
  const dots = spec.match(/^\.+/)?.[0].length ?? 0;
  const modulePart = spec.slice(dots).replace(/\./g, "/");
  let base = dir;
  for (let i = 1; i < dots; i++) {
    base = base.substring(0, base.lastIndexOf("/"));
  }
  const target = modulePart ? `${base}/${modulePart}` : base;
  for (const ext of PY_EXTENSIONS) {
    const candidate = normalizePath(target + ext);
    if (known.has(candidate)) return candidate;
  }
  return null;
}

function resolveGo(spec: string, known: Set<string>): string | null {
  for (const p of known) {
    if (p.endsWith(".go") && spec.endsWith(p.substring(0, p.lastIndexOf("/")))) {
      return p;
    }
  }
  return null;
}

function resolveRust(dir: string, spec: string, known: Set<string>): string | null {
  let base: string;
  if (spec.startsWith("crate::")) {
    base = spec.replace("crate::", "src/").replace(/::/g, "/");
  } else if (spec.startsWith("super::")) {
    const parent = dir.substring(0, dir.lastIndexOf("/"));
    base = `${parent}/${spec.replace("super::", "").replace(/::/g, "/")}`;
  } else {
    base = `${dir}/${spec.replace("self::", "").replace(/::/g, "/")}`;
  }
  const candidate = `${normalizePath(base)}.rs`;
  if (known.has(candidate)) return candidate;
  const modCandidate = `${normalizePath(base)}/mod.rs`;
  if (known.has(modCandidate)) return modCandidate;
  return null;
}

function normalizePath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join("/");
}
