---
phase: 01-core-daemon-mcp
plan: "03"
subsystem: infra
tags: [citty, cli, fetch, node-types, tsup, binary]

requires:
  - phase: 01-core-daemon-mcp
    plan: "01"
    provides: "@lens/core built — daemon pattern established"
provides:
  - "lens binary at packages/cli/dist/index.js (ESM, shebang)"
  - "citty CLI with status subcommand — fetch-to-daemon pattern"
  - "Graceful error handling: daemon down exits 1 with human-readable message"
affects:
  - "03-daemon — status subcommand calls /health, daemon must return {status, uptime, version}"
  - "Phase 3 — fill in grep, register, remove, list subcommands following this same pattern"

tech-stack:
  added:
    - "citty ^0.2.1 — CLI argument parsing, defineCommand/runMain"
    - "@types/node ^22.0.0 — Node.js type definitions (process.exit)"
  patterns:
    - "defineCommand pattern — each subcommand is a separate defineCommand() object"
    - "Fetch-to-daemon pattern — subcommands call daemon HTTP endpoints directly"
    - "Shebang banner in tsup — banner.js adds #!/usr/bin/env node to dist/index.js"
    - "console.log/error in CLI — stdout for output, stderr for errors (CLI is not daemon, stdout is OK)"

key-files:
  created:
    - "packages/cli/src/index.ts — citty main + status subcommand, DAEMON_URL constant"
    - "packages/cli/tsconfig.json — NodeNext module resolution, types:[node]"
    - "packages/cli/tsup.config.ts — ESM only, shebang banner"
  modified:
    - "packages/cli/package.json — added citty dep, @types/node devDep, tsup/typescript devDeps"

key-decisions:
  - "@types/node added to devDependencies — process.exit() requires Node types; plan omitted this"
  - "types:[node] in tsconfig — explicit rather than relying on ambient type resolution"
  - "console.log in CLI is correct — CLI is a user-facing terminal binary, not the daemon"
  - "ESM-only output — CLI is Node.js 18+ only, no CJS needed for binary"

patterns-established:
  - "Subcommand pattern: defineCommand() per subcommand, composed in main defineCommand subCommands map"
  - "Fetch-to-daemon: const DAEMON_URL = 'http://localhost:4111', catch block on connection refused"
  - "Phase 3 extension: add new subcommand as defineCommand(), import it, add to subCommands map"

requirements-completed: [CLI-01]

duration: 3min
completed: 2026-02-19
---

# Phase 1 Plan 03: @lens/cli Skeleton Summary

**citty CLI binary with `lens status` subcommand — fetch-to-daemon pattern, graceful error handling, shebang ESM binary output**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-19T06:36:37Z
- **Completed:** 2026-02-19T06:39:30Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments

- `lens` binary builds and executes via `node packages/cli/dist/index.js` — shebang enables direct invocation
- `lens status` fetches `/health`, prints daemon version/status/uptime/url, exits 0
- `lens status` (daemon down) catches connection refused, prints human-readable message, exits 1 — no stack trace
- `lens --help` works without crashing

## Task Commits

1. **Task 1: CLI scaffold + implementation** — `c180fa7` (feat)

**Plan metadata:** TBD (docs commit)

## Files Created/Modified

- `packages/cli/src/index.ts` — citty `main` command + `status` subcommand, `DAEMON_URL` constant at top
- `packages/cli/tsconfig.json` — `NodeNext` module resolution, `types: ["node"]` for `process.exit` TS compat
- `packages/cli/tsup.config.ts` — ESM only, `banner.js: '#!/usr/bin/env node'` shebang
- `packages/cli/package.json` — `citty ^0.2.1` dep, `@types/node ^22.0.0` + `tsup` + `typescript` devDeps

## How to Add New Subcommands (Phase 3 Reference)

```typescript
// 1. Define the subcommand
const grep = defineCommand({
  meta: { description: 'Search code by pattern' },
  args: {
    pattern: { type: 'positional', required: true },
  },
  async run({ args }) {
    const res = await fetch(`${DAEMON_URL}/grep?q=${args.pattern}`)
    // ...handle response
  },
})

// 2. Add to main subCommands map
const main = defineCommand({
  // ...
  subCommands: {
    status,
    grep,  // <-- add here
  },
})
```

`DAEMON_URL` constant is at the top of `packages/cli/src/index.ts`. All subcommands use it directly.

## Decisions Made

- Added `@types/node` to devDependencies — plan omitted this, but `process.exit()` fails typecheck without Node.js type definitions; added `types: ["node"]` in tsconfig for explicit resolution
- `console.log` in CLI is intentional and correct — CLI is a terminal binary targeting stdout, not the daemon where stdout is reserved for MCP JSON-RPC
- ESM-only tsup output — CLI targets Node.js 18+ only, no CJS dual build needed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added @types/node devDependency and types config**
- **Found during:** Task 1 (typecheck step)
- **Issue:** `process.exit()` fails typecheck with `TS2580: Cannot find name 'process'` — Node.js types not in scope
- **Fix:** Added `@types/node: ^22.0.0` to devDependencies; added `"types": ["node"]` to tsconfig.json
- **Files modified:** `packages/cli/package.json`, `packages/cli/tsconfig.json`
- **Verification:** `pnpm --filter @lens/cli typecheck` exits 0, zero errors
- **Committed in:** `c180fa7` (Task 1)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Required for typecheck to pass. No scope creep.

## Issues Encountered

None beyond the @types/node fix above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `@lens/cli` skeleton is built and tested
- Phase 3 can add `grep`, `register`, `remove`, `list` subcommands by following the `defineCommand` pattern above
- Daemon (`/health` endpoint) must return `{ status: string, uptime: number, version: string }` — matches `lens status` expected shape

## Self-Check: PASSED

Files verified:
- `packages/cli/src/index.ts` — FOUND
- `packages/cli/tsconfig.json` — FOUND
- `packages/cli/tsup.config.ts` — FOUND
- `packages/cli/package.json` — FOUND
- `packages/cli/dist/index.js` — FOUND (built artifact)
- Commit `c180fa7` — FOUND in git log

---
*Phase: 01-core-daemon-mcp*
*Completed: 2026-02-19*
