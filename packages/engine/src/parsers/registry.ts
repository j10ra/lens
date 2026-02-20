import type { LanguageParser } from "./types.js"

const parsers = new Map<string, LanguageParser>()

export function registerParser(parser: LanguageParser): void {
  for (const lang of parser.languages) {
    parsers.set(lang, parser)
  }
}

export function getParser(language: string | null): LanguageParser | null {
  return parsers.get(language ?? "") ?? null
}

// ── Auto-register all parsers ────────────────────────────────────────
import { typescriptParser } from "./typescript/index.js"

registerParser(typescriptParser)
