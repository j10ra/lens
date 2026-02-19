import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  // No CJS needed — daemon is a Node process, not a library
  // No createRequire banner needed — core package handles better-sqlite3 internally
  dts: false,
  splitting: false,
  clean: true,
  // Externalize workspace packages — they ship their own builds
  external: ['@lens/core', '@lens/engine'],
})
