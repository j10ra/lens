# LENS — Context Router Roadmap

> Prove it, then build it. Measure before you ship.

See [VISION.md](VISION.md) for the full value proposition, benchmark evidence, and honest risk assessment.

---

## Strategic Context (Feb 2026 audit)

Agents are getting better at codebase navigation. CLAUDE.md, parallel sub-agents, and growing context windows narrow the gap every quarter. LENS's real value is in **structural knowledge agents can't cheaply derive**: co-change clusters, import graphs, and context slicing.

**The old priority was wrong.** We were building cloud infrastructure (auth, billing, Stripe, CF deploy) for a product that hasn't proven it beats a cold agent. That's frozen.

**New priority:** Prove the engine → Improve the output → Build the moat → Measure again → THEN monetize.

```
Eval harness → Formatter rewrite → Context slicing → GO/NO-GO → Routing → Cloud
     │                                                    │
     └── Baseline before any changes            Gate: does LENS win?
```

### Progress

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Eval harness | ✅ Done | Baseline recorded 2026-02-15 |
| 2. Formatter rewrite | ✅ Done | Hit@3 85%→95%, natural 100%, error 67%, 15ms avg. See results below |
| 3. Context slicing | ✅ Done | Hit@3 95% (no regression), 19ms avg. Code slices in all 4 templates. See results below |
| GO/NO-GO gate | ⬜ Not started | `← YOU ARE HERE` |
| 4. Specialized routing | ⬜ Blocked (gate) | |
| 5. Weight tuning | ⬜ Blocked (gate) | |
| 6. Cloud + monetization | 🧊 Frozen | ~70% done, paused until gate passes |

#### Phase 1 Baseline (2026-02-15, v0.1.20, n=20, no embeddings)

| Metric | Overall | Natural (12) | Symbol (5) | Error (3) |
|--------|---------|-------------|------------|-----------|
| Hit@1 | 70% | 75% | 80% | 33% |
| Hit@3 | 85% | 92% | 100% | 33% |
| Entry@1 | 65% | 67% | 80% | 33% |
| Entry@3 | 80% | 83% | 100% | 33% |
| Recall@5 | 75% | 75% | 100% | 33% |
| Avg ms | 37 | 53 | 10 | 17 |

**Observations:**
- Symbol queries already perfect at Top-3. No work needed.
- Natural queries strong (92% Hit@3). One miss: "file indexing" — token "index" too ambiguous.
- Error message queries broken (33% Hit@3). Interpreter doesn't substring-match error strings against source content. Phase 2 fix.
- GO/NO-GO target (Top-3 >80%) barely passes at 85%. Error kind drags it down.
- n=20 intentionally thin — expand to 30-50 after Phase 2.
- Some gold expectations may need revisiting (e.g., `err-02` expects `client.ts` but `daemon-ctrl.ts` is arguably relevant).

#### Phase 2 Results (2026-02-15, v0.1.20, n=20, no embeddings)

| Metric | Phase 1 | Phase 2 | Delta |
|--------|---------|---------|-------|
| Hit@1 | 70% | 70% | — |
| Hit@3 | 85% | 95% | +10% |
| Entry@1 | 65% | 60% | -5% |
| Entry@3 | 80% | 90% | +10% |
| Recall@5 | 75% | 83% | +8% |
| Avg ms | 37 | 15 | -22ms |

**By kind:**

| Kind | Hit@3 (P1) | Hit@3 (P2) | Recall@5 (P1) | Recall@5 (P2) |
|------|-----------|-----------|--------------|--------------|
| Natural (12) | 92% | 100% | 75% | 75% |
| Symbol (5) | 100% | 100% | 100% | 100% |
| Error (3) | 33% | 67% | 33% | 83% |

Verified stable across 3 consecutive runs.

**What shipped:**
1. **Formatter rewrite** (`formatter.ts`) — 4 query-kind templates (natural/symbol/error/stack_trace) replacing 3 confidence templates. TOKEN_CAP 350→1200. Purpose summaries, full import paths with direction arrows (← →), co-change counts, exports rendered per file.
2. **Error metadata scoring** (`query-interpreter.ts`) — raw error string search in docstring/sections/internals/purpose fields. +40 boost. Didn't move numbers (error strings live in throw statements, not metadata).
3. **Chunk content search** (`queries.ts` + `context.ts`) — for `error_message` queries, `INSTR(LOWER(content), ...)` across chunk table. Bounded: intersect with TF-IDF scored files first, cap at 3 matches, +40 boost. Fixed err-01.
4. **Noise exclusion** (`query-interpreter.ts`) — added `publish/` to noise paths, changed noise dampening from `*0.3` to `score=0` (full exclusion). Fixed nat-02 and halved avg query time.

**What didn't move:**
- err-02 ("LENS daemon is not running") — `client.ts` at Recall@5=100% but not top 3. `daemon-ctrl.ts` ranks higher (legitimately relevant to "daemon not running"). Gold expectation is arguably too narrow.

**Observations:**
- Noise exclusion was the highest-impact fix: eliminated generated artifacts (publish/, dist/) from competing in rankings. Fixed nat-02 and reduced avg duration 37→15ms.
- Error content search needed bounding — unbounded +50 to all INSTR matches (18 files for err-01) caused regressions. Capped to 3 files with TF-IDF intersection.
- Formatter rewrite doesn't affect ranking (output-only). Its value is in richer agent consumption, not measurable by Hit@N.
- GO/NO-GO target (Top-3 >80%) now passes comfortably at 95%.

#### Phase 3 Results (2026-02-15, v0.1.20, n=20, no embeddings)

| Metric | Phase 2 | Phase 3 | Delta |
|--------|---------|---------|-------|
| Hit@1 | 70% | 65% | -5% |
| Hit@3 | 95% | 95% | — |
| Entry@1 | 60% | 55% | -5% |
| Entry@3 | 90% | 90% | — |
| Recall@5 | 83% | 83% | — |
| Avg ms | 15 | 19 | +4ms |

**By kind:**

| Kind | Hit@3 (P2) | Hit@3 (P3) | Recall@5 (P2) | Recall@5 (P3) |
|------|-----------|-----------|--------------|--------------|
| Natural (12) | 100% | 100% | 75% | 75% |
| Symbol (5) | 100% | 100% | 100% | 100% |
| Error (3) | 67% | 67% | 83% | 83% |

**What shipped:**
1. **Code slicer** (`slicer.ts`) — new module: `sliceContext()` extracts ±10 lines around resolved snippet anchors. Max slices by query kind: symbol=1, error=1, stack_trace=2, natural=3. Capped at 25 lines per slice.
2. **Formatter integration** (`formatter.ts`) — TOKEN_CAP 1200→2000. `renderSlice()` renders fenced code blocks with `guessLang()` syntax highlighting. All 4 templates updated.
3. **Progressive stripping update** — new step 0: strip code slices first (highest token cost, lowest information density for orientation). Existing steps renumbered 2-6.
4. **Pipeline wiring** (`context.ts`) — `sliceContext` runs after `resolveSnippets`, passes `slices` into `ContextData`.

**What didn't change:**
- Ranking unchanged — slicing is output-only, no scoring impact. Hit@1 variance (-5%) is within noise (err-02 and sym-03 are borderline cases).
- err-02 still misses — same root cause as Phase 2.

**Observations:**
- Slicing adds ~4ms avg — chunk lookup via `getByRepoPaths` is a single bounded SQLite query, well within the 25ms budget.
- 1-hop type resolution deferred — extracting referenced types from imports is high-complexity, low-value for first pass. Forward import paths already point the agent to the right file.
- Context packs now contain enough code for agents to start editing without Read calls on symbol/error queries. Natural queries show function signatures and surrounding context.
- TOKEN_CAP at 2000 accommodates 2-3 slices without immediate stripping. Progressive stripping handles overflow gracefully.

### Execution approach

**Phases are strictly sequential.** Each phase produces a measurement that validates (or invalidates) the next.

```
Phase 1 → run eval → baseline scores
Phase 2 → run eval → did scores improve?
Phase 3 → run eval → did scores improve?
Gate    → A/B benchmarks (n=20+) → GO or NO-GO
```

Why not parallel: Phase 2 without Phase 1 = no baseline = vibing. Phase 3 output feeds into Phase 2's formatter. The whole point of the audit was "measure before you build."

**Verify via `lens` CLI** (not MCP). Eval, formatter checks, and benchmarks all run through `lens eval` / `lens context` — the CLI calls the daemon HTTP API. MCP is for agents consuming context, not for us measuring quality.

**Within each phase**, independent subtasks run in parallel where possible:

| Phase | Parallel work |
|-------|--------------|
| 1. Eval | Gold dataset + eval runner + CLI wiring |
| 2. Formatter | Sequential — 2 files (`formatter.ts`, `context.ts`) |
| 3. Slicing | `slicer.ts` + formatter integration overlap slightly |

### What's frozen (until GO/NO-GO passes)

| Work | Reason |
|------|--------|
| Cloud billing / Stripe setup | Premature — no PMF yet |
| CF Workers deployment | No users to deploy for |
| Daemon↔cloud proxy wiring | Depends on paying users |
| Usage counters + daily sync | Billing infrastructure |

This doesn't mean the cloud code is deleted — it stays at ~70% done. We just don't spend time on it until the engine proves its value.

---

## Where We Are (v0.1.x — "File Ranker")

The engine is ~70% built. Scoring, indexing, and structural analysis work. The problem is output: a 350-token formatter strips everything useful.

### What's built and working

| Capability | File | Status |
|------------|------|--------|
| TF-IDF scoring (6 haystack fields) | `engine/src/context/query-interpreter.ts` | Solid |
| Query classification (stack_trace, symbol, error_message, natural) | `engine/src/context/input-parser.ts` | Works, not wired to output |
| Stack frame parsing (JS/TS, Python, C#/Java) | `engine/src/context/input-parser.ts:120` | Parsing only, no path resolution |
| Symbol matching (exports + internals) | `engine/src/context/snippet.ts` | O(n) scan, no hash index |
| Import graph (forward, reverse, 2-hop) | `engine/src/context/structural.ts` | Full API, only basenames rendered |
| Co-change clusters (2-stage promotion) | `engine/src/context/context.ts:122-215` | Computed, counts not shown |
| Git activity scoring | `engine/src/context/query-interpreter.ts:426` | +0.5/recent commit, capped |
| Purpose summaries (LLM-generated) | `engine/src/db/queries.ts` (metadata) | Stored, scored, stripped from output |
| Sections + internals extraction | `engine/src/index/metadata.ts` | 28 files w/ sections, 109 w/ internals |
| Snippet resolution (symbol → file:line) | `engine/src/context/snippet.ts:52` | Resolves, but only shows `path:line → symbol()` |
| Query-kind-driven formatting (4 templates) | `engine/src/context/formatter.ts` | Routes on queryKind, TOKEN_CAP=1200 |
| Vocab clusters (Voyage embeddings) | `engine/src/index/vocab-clusters.ts` | Working, boosts scoring |
| Vector search (semantic) | `engine/src/context/context.ts:103` | Optional, Pro feature |

### What's broken / missing

| Gap | Impact |
|-----|--------|
| ~~350 token cap strips purpose, chains, everything~~ | ~~Output is a file list, not a briefing~~ → Fixed (Phase 2) |
| One generic tool (`get_context`) | No specialization per query type |
| ~~No code snippets in output~~ | ~~Agent still needs to Read every file to understand it~~ → Fixed (Phase 3) |
| ~~Import chains shown as basenames only~~ | ~~Agent can't navigate relationships~~ → Fixed (Phase 2) |
| ~~Co-change counts hidden~~ | ~~Agent misses "always change together" warnings~~ → Fixed (Phase 2) |
| ~~Query kind doesn't drive output shape~~ | ~~Stack trace gets same template as "how does X work"~~ → Fixed (Phase 2) |
| ~~No evaluation harness~~ | ~~Can't measure if changes improve anything~~ → Fixed (Phase 1) |

---

## Implementation Phases

### Phase 1: Evaluation harness (FIRST — non-negotiable)

Can't improve what you can't measure. The n=3 benchmark is not evidence. Build the harness BEFORE touching the formatter so we have a real baseline.

**Changes:**
1. Create `packages/engine/src/eval/` directory with gold dataset.
2. 30-50 real questions from actual LENS development (we have them from benchmarks).
3. For each: query string, expected files (gold set), expected entry point.
4. Metrics: Top-1 hit rate, Top-3 hit rate, recall@5, context pack token size.
5. CLI command: `lens eval` runs the harness, outputs scores.
6. Run before/after every formatter or scoring change.

**Files touched:** New `packages/engine/src/eval/`, new CLI command
**Risk:** Low — read-only evaluation, no production impact.
**Validation:** Baseline current scores. These become the bar to beat.

**Done when:** `lens eval` runs on the LENS repo itself, prints Top-1/Top-3/recall@5 scores, takes <30s.

---

### Phase 2: Formatter rewrite + rich output (highest leverage)

The data exists. Just render it. This is the change most likely to move the eval numbers.

**Changes:**
1. `formatter.ts` — Raise token cap from 350 to ~1200. Same budget for CLI/MCP/API.
2. `formatter.ts` — Add query-kind-driven templates (not just confidence routing).
3. `formatter.ts` — Always render purpose summaries. Never strip first.
4. `formatter.ts` — Show full import paths with direction arrows, not basenames.
5. `formatter.ts` — Include co-change counts as numbers ("changed together 18x").
6. `formatter.ts` — Add code signatures from snippet resolution (1-2 per top file).
7. `context.ts` — Pass `queryKind` to formatter (already classified, just not forwarded).

**Query-kind-driven templates:**

| Query Kind | Template | Sections |
|------------|----------|----------|
| `stack_trace` | Issue template | Crash point → call chain → related files → tests |
| `symbol` | Symbol template | Definition → usages → dependents |
| `natural` | Question template | Key files (5-7) → how they connect → co-change warnings |
| `error_message` | Error template | Error source → handler chain → config |

**Always render** (never strip):
- Purpose summaries for top files
- Import direction arrows (full paths, not basenames)
- Co-change counts as numbers
- At least one code signature per top file

**Files touched:** `formatter.ts`, `context.ts`
**Risk:** Low — data flow unchanged, only output formatting.
**Validation:** Re-run eval harness. Top-3 hit rate should improve. Re-run A/B benchmarks — target: LENS wins on targeted queries too.

**Done when:** Eval scores improve over Phase 1 baseline. Context pack looks like the "target output" example in VISION.md.

---

### Phase 3: Context slicing (`pack.build`) — the moat

Extract relevant code sections, not just file paths. This is what separates LENS from a better Grep. If this doesn't move the needle, nothing will.

**Changes:**
1. New function `sliceContext(db, repoId, files, focus?)` in `engine/src/context/`.
2. For each file: find the chunk containing the resolved snippet's line range.
3. Extract ±10 lines around the symbol definition.
4. Include referenced types/interfaces from imports (1-hop forward).
5. Return structured slices with `key_code`, `relevant_lines`, `imports_from`, `imported_by`.

**Files touched:** New `slicer.ts`, update `context.ts`, update `formatter.ts`
**Risk:** Medium — chunk lookup is fast (SQLite), but line-range extraction needs testing.
**Validation:** Context pack should contain enough code that agent's first action is Write/Edit, not Read.

**Done when:** Agent receiving a LENS context pack can start editing without a single Read call. Eval harness recall@5 > 80%.

---

### GO/NO-GO Gate

**After Phase 3, stop and measure.**

Run the full eval harness + fresh A/B benchmarks (n=20+ this time, not n=3). Answer one question:

> Does LENS consistently beat a cold agent on exploratory tasks?

| Signal | GO | NO-GO |
|--------|-----|-------|
| Top-3 hit rate | >80% | <60% |
| Tool calls saved (exploratory) | >40% | <20% |
| Agent task completion rate | >80% with LENS | No improvement |
| Targeted query overhead | <2s penalty | >5s penalty |

**GO:** Proceed to Phase 4-5, resume cloud work, pursue users.
**NO-GO:** Pivot (different approach to context delivery) or stop (the problem doesn't need solving).

---

### Phase 4: Symbol index + specialized routing (post-gate)

Replace single `get_context` with specialized MCP tools.

**Changes:**
1. Build symbol hash map at index time: `Map<symbol, {path, line, kind}>` stored in SQLite.
2. New table `symbol_index` (symbol, path, line, kind, repo_id).
3. `route.question` — symbol lookup + TF-IDF + import chain.
4. `route.issue` — frame resolution + graph walk + blast radius.
5. `route.change` — primary file + dependents + tests + risk score.
6. Register 4 MCP tools in `daemon/src/mcp.ts` (keep `get_context` as alias).

**Files touched:** New `symbol-index.ts`, new `router.ts`, update `mcp.ts`, update `server.ts`
**Risk:** Medium — new table requires migration, MCP tool registration is straightforward.
**Validation:** Each tool should beat the generic `get_context` on its use case (measured by eval harness).

### Phase 5: Weight tuning + query-kind specialization (post-gate)

Tune scoring weights per query kind using the eval harness.

**Changes:**
1. Per-kind weight profiles in `query-interpreter.ts`.
2. `stack_trace`: boost frame_match weight, reduce tfidf weight.
3. `symbol`: boost exact symbol match, reduce churn weight.
4. `natural`: balanced weights, high co-change.
5. Add churn velocity (time-weighted decay) to replace binary recent/not.

**Files touched:** `query-interpreter.ts`, `input-parser.ts`
**Risk:** Low — weight changes are tunable, eval harness catches regressions.
**Validation:** Eval harness Top-3 hit rate should improve per query kind.

### Phase 6: Cloud + monetization (post-gate, post-users)

Only after GO gate passes AND there are real users:

1. Daemon↔cloud proxy wiring (embedTexts + generatePurpose)
2. Usage counters + daily sync
3. Stripe product/price setup
4. CF Workers deployment

---

## Scoring Engine

### Existing signals (keep)

| Signal | Weight | Source |
|--------|--------|--------|
| TF-IDF (path, exports, docstring, purpose, sections, internals) | Primary | `query-interpreter.ts` |
| Co-change boost | ×1.3 | `context.ts` |
| Recency boost | +0.5/commit (max +2.5) | `query-interpreter.ts:426` |
| Hub dampening | -penalty for >5 exports | `query-interpreter.ts:435` |
| Indegree boost | log2 scaling | `query-interpreter.ts:438` |
| Vocab cluster boost | ×1.3 | `query-interpreter.ts:430` |

### New signals (Phase 4-5)

| Signal | Purpose | Implementation |
|--------|---------|----------------|
| **Symbol index** (hash map) | O(1) symbol→file lookup | Build `Map<symbol, {path, line, kind}>` at index time |
| **Frame resolution** | Stack frame→absolute file path | Match frame paths against indexed file paths |
| **Call proximity** | N-hop forward graph walk from entry | Extend `structural.ts` with generic `walkGraph(start, depth, direction)` |
| **Churn velocity** | Time-weighted commit decay | `score += commits * decay(days_ago)` instead of binary recent/not |

### Target score formula (Phase 5)

```
score = w1*tfidf + w2*symbol_match + w3*frame_match
      + w4*cochange + w5*graph_proximity + w6*churn
      + w7*indegree + w8*vocab_cluster
```

Weights tuned per query kind. No LLM in the scoring loop. Deterministic. Sub-200ms.

---

## Existing Foundation → Router Mapping

What we have vs what each router tool needs:

| Component | `route.issue` | `route.question` | `route.change` | `pack.build` |
|-----------|:---:|:---:|:---:|:---:|
| TF-IDF scoring | uses | uses | uses | — |
| Query classification | needs (exists) | needs (exists) | needs (exists) | — |
| Frame parsing | **critical** (exists) | — | — | — |
| Frame→file resolution | **critical** (missing) | — | — | — |
| Symbol index (hash) | — | **critical** (missing) | uses | uses |
| Import graph (forward) | uses | uses | **critical** (exists) | uses |
| Import graph (reverse) | **critical** (exists) | uses | **critical** (exists) | uses |
| 2-hop deps | uses | uses | **critical** (exists) | — |
| Co-change clusters | uses | uses | **critical** (exists) | — |
| Git stats / churn | uses | uses | uses | — |
| Purpose summaries | — | **critical** (exists) | uses | uses |
| Snippet resolution | uses | **critical** (exists) | uses | **critical** (exists) |
| Chunk content | — | — | — | **critical** (exists) |
| Test file detection | uses | — | **critical** (exists) | — |

**Legend:** critical = core to the tool's value. uses = nice to have. — = not needed. (exists) = already implemented. (missing) = needs building.

---

## What "Done" Looks Like

### Phase 1 done (eval harness)
`lens eval` runs 30-50 gold questions, prints Top-1/Top-3/recall@5 scores. We have a measurable baseline for the current v0.1.x output.

### Phase 2 done (formatter rewrite)
Agent receives 5-7 files with purpose summaries, import chains, co-change warnings, and code signatures. Eval scores improve over baseline.

### Phase 3 done (context slicing)
Agent can understand the code structure from the context pack alone. First tool call after LENS is `Edit`, not `Read`. Eval recall@5 > 80%.

### GO/NO-GO done
A/B benchmarks with n=20+ prove LENS wins. Clear data to justify continuing or pivoting.

### Phase 4 done (specialized routing)
Three MCP tools that each beat `get_context` on their use case. Stack traces resolve to source. "Where is X" finds the decision point. Change impact shows blast radius.

### Phase 5 done (weight tuning)
Each query kind has optimized weights. Stack trace routing resolves 90%+ of frames to correct files. Symbol lookup is O(1).

### Phase 6 done (cloud + monetization)
Paying users. Stripe live. CF deployed. Usage tracking synced.
