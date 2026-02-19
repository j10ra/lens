import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  splitting: false,
  clean: true,
  // Add shebang so the binary is directly executable
  banner: {
    js: '#!/usr/bin/env node',
  },
})
