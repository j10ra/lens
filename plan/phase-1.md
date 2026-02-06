# Phase 1 — CLI Bridge

**Goal:** `rlm` CLI talks to daemon from any repo. Claude Code can call it as a tool.

**Status:** [ ] Pending

**Depends on:** Phase 0

---

## Tasks

### 1.1 — CLI project setup
- [ ] Init `packages/rlm-cli/` with TypeScript
- [ ] Pick CLI framework (Commander.js — lightweight, zero magic)
- [ ] Configure build: compile to single executable or `npx`-runnable
- [ ] Add `bin` entry in `package.json` → `rlm`

### 1.2 — Repo detection utility
- [ ] `packages/rlm-cli/src/util/repo.ts`
- [ ] Walk up from `cwd` to find `.git` directory → repo root
- [ ] Extract `remote_url` from `.git/config` if available
- [ ] Derive `name` from folder name or remote URL
- [ ] Return `{ root_path, name, remote_url }` or error if not in a git repo

### 1.3 — HTTP client utility
- [ ] `packages/rlm-cli/src/util/client.ts`
- [ ] Base URL: `http://localhost:4000` (configurable via `RLM_HOST` env)
- [ ] Typed request/response helpers (fetch-based, no deps)
- [ ] Error handling: daemon not running → clear message

### 1.4 — Command: `rlm repo register`
- [ ] Auto-detect repo → call `POST /repo/register`
- [ ] Print: `Registered <name> (repo_id: <id>)`
- [ ] If already registered: `Already registered <name>`

### 1.5 — Command: `rlm task "<goal>"`
- [ ] Auto-detect repo → auto-register if needed
- [ ] Call `POST /task` with `{ repo_id, goal }`
- [ ] Print returned context pack as markdown
- [ ] (Phase 0-1: stub response from daemon is fine)

### 1.6 — Command: `rlm search "<query>"`
- [ ] Auto-detect repo → auto-register if needed
- [ ] Call `POST /search` with `{ repo_id, query }`
- [ ] Print results as markdown list: `path:line — snippet`

### 1.7 — Command: `rlm read <path> [start] [end]`
- [ ] Resolve path relative to repo root
- [ ] Call `POST /read` with `{ repo_id, path, start?, end? }`
- [ ] Print file content with line numbers

### 1.8 — Output formatting
- [ ] All outputs: clean markdown, no ANSI colors by default
- [ ] `--json` flag for structured output (useful for piping)
- [ ] Errors go to stderr, data to stdout

### 1.9 — Daemon-side stubs
- [ ] `POST /task` — return placeholder context pack
- [ ] `POST /search` — return empty results
- [ ] `POST /read` — read file from disk, return content
- [ ] These stubs get replaced in later phases

---

## Exit Criteria

- [ ] From any git repo: `rlm repo register` works
- [ ] `rlm task "add tests"` returns a markdown response
- [ ] `rlm search "TODO"` returns results (even if stub)
- [ ] `rlm read src/index.ts 1 50` returns file content
- [ ] Output is pasteable into Claude Code

---

## Architecture Notes

```
packages/rlm-cli/
├── src/
│   ├── index.ts              # Entry point, Commander setup
│   ├── commands/
│   │   ├── register.ts       # rlm repo register
│   │   ├── task.ts           # rlm task "<goal>"
│   │   ├── search.ts         # rlm search "<query>"
│   │   └── read.ts           # rlm read <path> [start] [end]
│   └── util/
│       ├── repo.ts           # Git repo detection
│       ├── client.ts         # HTTP client to daemon
│       └── format.ts         # Markdown output formatting
├── package.json
└── tsconfig.json
```
