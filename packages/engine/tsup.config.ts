import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  splitting: false,
  clean: true,
  external: ['@lens/core'],
  banner(ctx) {
    // better-sqlite3 is a native CJS addon — needs createRequire in ESM context
    if (ctx.format === 'esm') {
      return {
        js: `import {createRequire as __createRequire} from 'module';var require=__createRequire(import.meta.url);`
      }
    }
    return {}
  },
})
