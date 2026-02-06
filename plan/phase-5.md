# Phase 5 — Context Pack Builder

**Goal:** Generate a focused "Context Pack" markdown bundle for any task. Claude Code solves tasks using context pack alone — no repo scanning needed.

**Status:** [ ] Pending

**Depends on:** Phase 3, Phase 4

---

## Tasks

### 5.1 — Task analysis
- [ ] Create `apps/rlm/context/analyzer.ts`
- [ ] Input: `{ repo_id, goal: string }`
- [ ] Call GLM-4.7 to decompose goal into:
  ```ts
  {
    keywords: string[]          // search terms extracted from goal
    likely_files: string[]      // guessed file paths
    scope: "narrow" | "broad"   // affects how much context to include
    task_type: "fix" | "feature" | "refactor" | "test" | "explore"
  }
  ```
- [ ] Use repo map + summaries as input context for analysis

### 5.2 — Context gathering pipeline
- [ ] Create `apps/rlm/context/gather.ts`
- [ ] Pipeline steps:
  1. **Repo map** — always include (from Phase 4)
  2. **Search** — run hybrid search for each keyword (from Phase 3)
  3. **File summaries** — for top-hit files, include summaries
  4. **Key snippets** — extract most relevant code blocks (< 50 lines each)
  5. **Dependency graph** — for target files, include import chain (1 level)
- [ ] Budget: total context pack < 8000 tokens (configurable)
- [ ] Priority: snippets > summaries > map > dependency info

### 5.3 — Context pack formatter
- [ ] Create `apps/rlm/context/formatter.ts`
- [ ] Output `context_pack.md`:
  ```markdown
  # Context Pack: <goal>

  ## Repo Map
  <condensed tree>

  ## Relevant Files
  ### path/to/file.ts
  **Summary:** <cached summary>
  **Key snippet (lines 45-78):**
  ```ts
  <code>
  ```

  ## Dependencies
  - file.ts imports: auth.ts, db.ts
  - auth.ts imports: jwt.ts

  ## Constraints
  - <any inferred constraints from repo structure>
  ```

### 5.4 — Plan generator
- [ ] Create `apps/rlm/context/planner.ts`
- [ ] Call GLM-4.7 with context pack to generate:
  ```ts
  {
    steps: Array<{
      description: string
      target_file: string
      action: "create" | "modify" | "delete"
    }>
    reads_needed: string[]      // files to read in full before patching
    risks: string[]             // potential issues to watch for
  }
  ```
- [ ] Include plan as `plan.json` alongside context pack

### 5.5 — Task endpoint
- [ ] Update `POST /task` endpoint (replace Phase 1 stub):
  - Input: `{ repo_id, goal: string }`
  - Pipeline: analyze → gather → format → plan
  - Response: `{ context_pack: string, plan: Plan }`
- [ ] Ensure auto-index if repo hasn't been indexed yet
- [ ] Ensure summaries are fresh (trigger generation if missing)

### 5.6 — Update CLI
- [ ] `rlm task "<goal>"` now returns full context pack
- [ ] Print context pack markdown to stdout
- [ ] `--plan` flag to also print plan.json as formatted markdown
- [ ] `--budget N` flag to control context pack token limit

---

## Exit Criteria

- [ ] `rlm task "add rate limiting to API"` returns a context pack with:
  - Repo map
  - Relevant API files + summaries
  - Key snippets showing current request handling
  - A plan with concrete steps
- [ ] Context pack is < 8000 tokens
- [ ] Claude Code can use the context pack to start implementing without additional file reads
- [ ] Task analysis correctly identifies scope (narrow vs broad)

---

## Architecture Notes

```
apps/rlm/context/
├── context.ts          # POST /task — main endpoint
├── analyzer.ts         # Goal → keywords + scope + task type
├── gather.ts           # Orchestrate search + summaries + snippets
├── formatter.ts        # Assemble context_pack.md
└── planner.ts          # Generate plan.json
```

### Context pack pipeline

```
Goal: "add rate limiting to API"
         │
         ▼
    Task Analyzer (GLM-4.7)
    → keywords: ["rate limit", "middleware", "api", "request"]
    → scope: narrow
         │
         ▼
    Context Gatherer
    ├── Repo map (cached)
    ├── Search: 4 queries → top chunks
    ├── File summaries (cached)
    └── Key snippets (extracted)
         │
         ▼
    Formatter → context_pack.md
    Planner  → plan.json
```
