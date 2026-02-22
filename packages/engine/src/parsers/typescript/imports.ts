const TS_STATIC_RE = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
const TS_DYNAMIC_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const TS_REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const TS_EXPORT_RE = /export\s+(?:.*?\s+from\s+)['"]([^'"]+)['"]/g;

export function extractImports(content: string): string[] {
  const specs = new Set<string>();
  for (const re of [TS_STATIC_RE, TS_DYNAMIC_RE, TS_REQUIRE_RE, TS_EXPORT_RE]) {
    re.lastIndex = 0;
    for (const m of content.matchAll(re)) {
      const spec = m[1];
      if (spec.startsWith(".")) specs.add(spec);
    }
  }
  return [...specs];
}
