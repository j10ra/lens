const TS_EXPORT_RE =
  /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|enum|namespace)\s+(\w+)/gm

export function extractExports(content: string): string[] {
  const result: string[] = []
  for (const m of content.matchAll(new RegExp(TS_EXPORT_RE.source, "gm"))) {
    if (m[1] && !result.includes(m[1])) result.push(m[1])
  }
  return result.slice(0, 30)
}
