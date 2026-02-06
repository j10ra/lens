# Phase 0 — Foundations

**Goal:** Boot Encore.ts app + Postgres with pgvector. Health check and repo registration work.

**Status:** [x] Done

---

## Tasks

### 0.1 — Project scaffolding
- [ ] Init monorepo root (`package.json` with workspaces)
- [ ] Create `apps/rlm/` — Encore.ts app (`encore app create`)
- [ ] Create `packages/rlm-cli/` — placeholder for CLI
- [ ] Add `.gitignore` (node_modules, dist, .encore, .rlm)
- [ ] Init git repo

### 0.2 — Postgres + extensions setup
- [ ] Add Encore SQLDatabase declaration in `apps/rlm/repo/db.ts`
- [ ] Create migration `001_init.up.sql`:
  - Enable extensions (both required before table creation):
    ```sql
    CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
    CREATE EXTENSION IF NOT EXISTS vector;      -- pgvector
    ```
  - Create `repos` table:
    ```sql
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_key    TEXT UNIQUE NOT NULL,       -- SHA-256(normalized_remote_url) or SHA-256(abs_path)
    name            TEXT NOT NULL,
    root_path       TEXT NOT NULL,
    remote_url      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
    ```
  - `identity_key` = deterministic repo identity (see below)
  - `root_path` is NOT unique — same repo can be cloned in multiple locations
  - `identity_key` IS unique — same remote = same repo regardless of clone path
- [ ] Verify migration runs on `encore run`

### 0.3 — Health service
- [ ] Create `apps/rlm/health/health.ts`
- [ ] `GET /health` → returns `{ status: "ok", version: "0.1.0" }`
- [ ] Verify with `curl localhost:4000/health`

### 0.4 — Repo identity derivation
- [ ] Create `apps/rlm/repo/identity.ts`
- [ ] Derive `identity_key` from inputs:
  ```
  if remote_url exists:
    normalize(remote_url) → strip .git, convert SSH→HTTPS
    identity_key = SHA-256(normalized_remote_url)
  else:
    identity_key = SHA-256(absolute_root_path)
  ```
- [ ] `git@github.com:user/repo.git` == `https://github.com/user/repo` → same key
- [ ] Same repo, two clone locations, same remote → same `identity_key`

### 0.5 — Repo service
- [ ] Create `apps/rlm/repo/repo.ts`
- [ ] `POST /repo/register` endpoint:
  - Input: `{ root_path: string, name?: string, remote_url?: string }`
  - Compute `identity_key` from inputs
  - Behavior: upsert by `identity_key` (not root_path)
  - On conflict: update `root_path` to latest clone location
  - Response: `{ repo_id: string, identity_key: string, name: string, created: boolean }`
- [ ] `GET /repo/:id` — fetch repo by id
- [ ] `GET /repo/list` — list all registered repos

### 0.6 — Validation + smoke test
- [ ] `encore run` boots without errors
- [ ] DB migrates automatically (pgcrypto + vector extensions load)
- [ ] `/health` returns 200
- [ ] Register a repo → get repo_id back
- [ ] Register same repo again → same repo_id (upsert by identity_key)
- [ ] Register same remote from different path → same repo, updated root_path
- [ ] List repos → see registered repo

---

## Exit Criteria

- [ ] when Boss confirms: `encore run` boots, DB migrates (pgcrypto + vector), health OK, repo register works with identity_key

---

## Architecture Notes

```
apps/rlm/
├── encore.app.ts
├── health/
│   └── health.ts          # GET /health
├── repo/
│   ├── repo.ts            # POST /repo/register, GET /repo/:id, GET /repo/list
│   ├── identity.ts        # identity_key derivation + remote URL normalization
│   ├── db.ts              # SQLDatabase declaration
│   └── migrations/
│       └── 001_init.up.sql
```

Each Encore service = a folder with exported API endpoints. The DB is declared once and shared across services that need it.
