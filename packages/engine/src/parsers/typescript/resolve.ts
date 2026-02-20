import * as path from "node:path"
import { normalizePosix } from "../common/resolve.js"

const TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"]

export function resolveImport(
  specifier: string,
  sourceFilePath: string,
  knownPaths: Set<string>,
): string | null {
  if (!specifier.startsWith(".")) return null

  const dir = path.posix.dirname(sourceFilePath)
  const base = normalizePosix(`${dir}/${specifier}`)

  if (knownPaths.has(base)) return base

  // Strip .js/.jsx/.mjs -- TS emits .js imports but source files are .ts
  const stripped = base.replace(/\.(js|jsx|mjs)$/, "")

  for (const ext of TS_EXTENSIONS) {
    const candidate = stripped + ext
    if (knownPaths.has(candidate)) return candidate
  }

  return null
}
