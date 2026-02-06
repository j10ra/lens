# Phase 6 — Patch + Apply + Run

**Goal:** Closed-loop fix cycle. Daemon generates diffs, applies them, runs tests — all within the repo.

**Status:** [ ] Pending

**Depends on:** Phase 5

---

## Tasks

### 6.1 — Traces table
- [ ] Migration `005_traces.up.sql`:
  ```sql
  CREATE TABLE traces (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id       UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    task_goal     TEXT NOT NULL,
    step          TEXT NOT NULL,           -- 'patch' | 'apply' | 'run'
    input         JSONB,
    output        JSONB,
    status        TEXT NOT NULL,           -- 'success' | 'failure' | 'error'
    duration_ms   INT,
    created_at    TIMESTAMPTZ DEFAULT now()
  );
  CREATE INDEX idx_traces_repo ON traces(repo_id);
  ```

### 6.2 — Patch generation service
- [ ] Create `apps/rlm/patch/generate.ts`
- [ ] `POST /patch/generate` endpoint:
  - Input: `{ repo_id, goal, context_pack, plan, target_files: string[] }`
  - Read full content of target files
  - Call GLM-4.7 with: context pack + full file contents + goal
  - Prompt: generate unified diff format
  - Response: `{ patches: Array<{ path, diff }>, trace_id }`
- [ ] Validate diff format before returning
- [ ] Store trace (input/output/status)

### 6.3 — Patch application service
- [ ] Create `apps/rlm/patch/apply.ts`
- [ ] `POST /patch/apply` endpoint:
  - Input: `{ repo_id, patches: Array<{ path, diff }>, dry_run?: boolean }`
  - Safety checks:
    - All paths must be within repo `root_path`
    - No path traversal (`..`)
    - Backup original files before apply (in-memory or temp)
  - Apply using `git apply` or manual unified diff parser
  - `dry_run: true` → validate only, don't write
  - Response: `{ applied: string[], failed: string[], trace_id }`
- [ ] On failure: rollback all changes (atomic apply)
- [ ] Store trace

### 6.4 — Command execution service
- [ ] Create `apps/rlm/runner/runner.ts`
- [ ] `POST /runner/run` endpoint:
  - Input: `{ repo_id, command: string, args?: string[], timeout_ms?: number }`
  - Safety — **no shell, exe allowlist**:
    - Parse input into `[executable, ...args]` (split on spaces, respect quotes)
    - Allowlist the **executable** only: `npm`, `npx`, `pnpm`, `yarn`, `bun`, `make`, `cargo`, `go`, `python`, `pytest`, `jest`, `vitest`
    - Execute via `child_process.spawn(exe, args, { shell: false, cwd: root_path })`
    - `shell: false` = no metacharacter injection possible (`&&`, `;`, `|` etc are literal args)
    - Max timeout: 120s (default 60s)
  - Capture stdout + stderr separately
  - Response: `{ exit_code, stdout, stderr, duration_ms, trace_id }`
- [ ] Store trace
- [ ] Kill process tree on timeout (`kill(-pid)` or `tree-kill`)

### 6.5 — End-to-end fix loop
- [ ] Create `apps/rlm/patch/loop.ts`
- [ ] `POST /patch/fix` endpoint (orchestrator):
  - Input: `{ repo_id, goal, test_command?: string, max_iterations?: number }`
  - Loop (max 3 iterations by default):
    1. Build context pack (Phase 5)
    2. Generate patches
    3. Apply patches (dry run first, then real)
    4. Run test command
    5. If tests pass → done
    6. If tests fail → include failure output in next iteration's context
  - Response: `{ success, iterations, patches_applied, test_output, traces }`

### 6.6 — Wire up CLI
- [ ] `rlm patch "<goal>"` — generate + show diff (don't apply)
- [ ] `rlm apply` — apply last generated patches
- [ ] `rlm run "<command>"` — execute command in repo
- [ ] `rlm fix "<goal>" --test "npm test"` — full fix loop
- [ ] All commands output clean markdown

### 6.7 — Safety guardrails
- [ ] Never execute commands outside repo root
- [ ] Never apply patches to files outside repo
- [ ] Require explicit confirmation for destructive operations (in CLI)
- [ ] Rate limit: max 10 patch generations per minute per repo
- [ ] Log all executions in traces table

---

## Exit Criteria

- [ ] `rlm patch "fix the failing test in auth.test.ts"` generates a valid diff
- [ ] `rlm apply` applies the diff cleanly
- [ ] `rlm run "npm test"` executes and returns results
- [ ] `rlm fix "fix failing tests" --test "npm test"` auto-loops to green
- [ ] All operations are traced and auditable
- [ ] No command injection possible via goal/command inputs

---

## Architecture Notes

```
apps/rlm/patch/
├── generate.ts         # POST /patch/generate — diff via GLM-4.7
├── apply.ts            # POST /patch/apply — apply/rollback diffs
├── loop.ts             # POST /patch/fix — end-to-end fix loop

apps/rlm/runner/
├── runner.ts           # POST /runner/run — sandboxed command execution
└── migrations/
    └── 005_traces.up.sql
```

### Fix loop flow

```
Goal: "fix failing test in auth.test.ts"
         │
    ┌────┴──── Iteration 1 ────┐
    │                           │
    ▼                           │
  Context Pack                  │
    ▼                           │
  Generate Patch                │
    ▼                           │
  Apply (dry run → real)        │
    ▼                           │
  Run Tests                     │
    │                           │
    ├── PASS → Done ✓           │
    └── FAIL → feed errors ─────┘
              back into context
```
