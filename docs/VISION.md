# LENS — Vision & Value Proposition

> LENS makes AI coding agents stronger.
> It gives them the headstart a senior teammate would — before a single Grep runs.

## The Problem

AI coding agents (Claude Code, Cursor, Copilot) are powerful but start every session blind:

1. Agent receives a task ("fix the rate limiting bug")
2. Agent runs 10-40 Glob/Grep/Read calls to orient itself
3. Some searches hit, most miss — the agent is guessing at file names and patterns
4. Agent finds *some* relevant files, misses others it didn't know to look for
5. Agent produces a partial solution because it never saw the full picture

This isn't an agent problem — it's an **information problem**. The agent is capable. It just doesn't know where to look.

A human senior engineer on the same team wouldn't search — they'd say:
- "Rate limiter is in `rate-limit.ts`, token bucket pattern"
- "State lives in KV store — check `env.ts` for the interface"
- "The middleware is applied in `api.ts:20`"
- "If you change the algo, also update `proxy.ts` — it reads the Retry-After headers"
- "These two files always change together, don't forget the second one"

That's what LENS provides: **persistent project knowledge that any agent can query instantly**.

## Core Thesis

```
LENS doesn't replace the agent's tools — it makes every tool call after it more precise.
```

LENS is a **force multiplier** for AI agents. It doesn't compete with Grep/Glob/Read — it front-loads the knowledge that makes those tools effective:

- **Without LENS**: Agent guesses search terms → scattered results → misses files → incomplete work
- **With LENS**: Agent gets a briefing → knows exactly which files to Read → targeted investigation → complete work

The agent still does all the investigation. LENS just ensures it starts in the right place, looking at the right files, aware of the right relationships. Every Grep after LENS is a *targeted* Grep, not a *discovery* Grep.

### The Headstart Model

```
Traditional agent workflow:
  Task → Grep → Grep → Glob → Grep → Read → Read → Grep → Read → Work
         ╰──────────── orientation (60%) ──────────╯  ╰── actual work ──╯

LENS-augmented workflow:
  Task → LENS context → Read → Read → Read → Work
         ╰─ briefing ─╯  ╰──── targeted investigation ────╯
```

LENS compresses the orientation phase into a single call. The agent's remaining tool budget goes entirely toward understanding and modifying code — not finding it.

## What LENS Is

A **local-first repo context engine** built for AI agent consumption:

1. **Indexes** your codebase (code chunks, exports, imports, git history, co-changes)
2. **Understands** the structure (import graph, co-change clusters, file purposes)
3. **Serves context packs** — ranked, relationship-aware briefings tailored to a goal
4. **Improves agent investigation** — every tool call after LENS is more targeted

LENS is to coding agents what a project wiki + senior teammate is to a new hire. It doesn't do the work — it ensures the work starts from the right place.

## What LENS Is Not

- Not a replacement for Grep/Glob/Read (agents still need them — LENS makes them more effective)
- Not a RAG system (no LLM in the retrieval loop — deterministic scoring)
- Not a search engine (doesn't just find text matches — understands structure and relationships)
- Not a code review tool (doesn't judge code quality — maps knowledge)
- Not a chatbot (no conversation — single query in, context pack out)

## Architecture (3 Layers)

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Engine     │     │    Daemon    │     │    Cloud      │
│  (SQLite)    │◄────│  (HTTP+MCP)  │────►│  (API+Admin)  │
│  packages/   │     │  apps/daemon │     │  apps/cloud   │
│  engine/     │     │  :4111       │     │               │
└─────────────┘     └──────────────┘     └──────────────┘
  Layer 1              Layer 2              Layer 3
  Core logic           Local server         Cloud control
  Zero network         Serves agents        Auth, billing,
  Pure indexing        File watchers         proxy, quotas
```

- **Layer 1 (Engine)**: Indexing, scoring, context generation. Pure TypeScript + SQLite. No network needed.
- **Layer 2 (Daemon)**: HTTP server on :4111. REST API + MCP stdio. Serves context packs to agents. File watchers for live re-indexing.
- **Layer 3 (Cloud)**: Optional. Auth, API keys, usage tracking, billing, Voyage embedding proxy.

## The Context Pack

When an agent asks `lens context "fix the rate limiting bug"`, LENS returns a **context pack** — a structured briefing containing:

### What it returns today (v0.2.x — post Phase 1-3)

| Component | Description |
|-----------|-------------|
| Ranked files (5-7) | Top files scored by TF-IDF + co-change + git activity + import depth |
| Purpose summaries | One-line description of what each file does (LLM-generated, always rendered) |
| Import chains | Full paths with direction arrows (← importers, → dependencies) |
| Code slices | ±10 lines around resolved symbols, syntax-highlighted fenced blocks |
| Co-change warnings | "changed together Nx" counts per file pair |
| Export names | What each file exposes |
| Query-kind templates | 4 specialized layouts: natural, symbol, error, stack_trace |

### What's still missing (post-gate)

| Component | Description |
|-----------|-------------|
| Specialized routing | `route.issue`, `route.question`, `route.change` instead of generic `get_context` |
| 1-hop type expansion | Include referenced types/interfaces from imports in slices |
| Relationship narrative | Brief explanation of how the pieces fit together |

## Benchmark Evidence

### A/B Tests: Agent with LENS vs Agent without (Feb 2026)

Tested Claude Haiku agents on the LENS codebase itself. Two query types:

#### Targeted queries ("find constant X in file Y")

| | LENS | No LENS | Winner |
|--|------|---------|--------|
| Avg tool calls | 4.7 | 3.0 | No LENS |
| Avg duration | 12.4s | 6.3s | No LENS |
| Accuracy | 100% | 100% | Tie |

LENS adds overhead when the agent already knows what to search for. This is expected — you don't ask a senior engineer "what file is `auth.ts`?" You just open it. LENS isn't for pinpoint lookups. It's for when you don't know where to start.

#### Exploratory queries ("where are the security boundaries?")

| | LENS | No LENS | Winner |
|--|------|---------|--------|
| Avg tool calls | 22.0 | 29.7 | LENS (-26%) |
| Avg input tokens | 979K | 1,570K | LENS (-38%) |
| Answer produced | 2/3 | 1/3 | LENS |
| Avg findings | 12.0 | 8.0 | LENS (+50%) |

LENS agents found 50% more patterns with 26% fewer tool calls. Critically, LENS agents **completed their task within the turn budget** while no-LENS agents burned all turns on orientation and never synthesized an answer.

This is the core value: LENS converts wasted orientation calls into productive investigation calls. The agent doesn't just find more — it has budget left to actually *think* about what it found.

#### The gap (closed in Phases 1-3)

The initial benchmarks (v0.1.x) validated the approach but exposed a delivery gap. Phases 1-3 closed it:
- ~~Returns 1 file ("start here") when 5-6 are needed~~ → 5-7 ranked files per query
- ~~Doesn't render the import chains it already computed~~ → Full paths with ← → direction arrows
- ~~Purpose summaries are scored but not displayed in output~~ → Always rendered in all templates
- ~~No code snippets — just paths and export names~~ → ±10 line code slices with syntax highlighting
- No relationship narrative between files *(still missing — post-gate)*

The scoring engine is solid. The output now delivers the knowledge LENS has. Remaining gap: specialized routing (route.issue, route.question, route.change) to replace the single generic `get_context` tool.

## North Star: What "Senior Engineer" Looks Like

For the query `"fix the rate limiting bug where tokens don't refill correctly"`:

### v0.1.x output (before Phases 1-3)
```
# fix the rate limiting bug where tokens don't refill correctly

## Start here
apps/cloud/src/middleware/rate-limit.ts:12 → rateLimit()
  exports: rateLimit
  Token bucket algorithm, 60 requests/min per user, KV state.

## Blast radius: 1 consumer
```

### v0.2.x output (current — after Phases 1-3)
```
# Error: fix the rate limiting bug where tokens don't refill correctly

## Error Source
1. **apps/cloud/src/middleware/rate-limit.ts:25** — Token bucket implementation
   Exports: rateLimit
   ← apps/cloud/src/api.ts | → apps/cloud/src/env.ts
   ```typescript
   const elapsed = now - bucket.lastRefill;
   const refill = Math.floor(elapsed / 1000) * REFILL_RATE;
   bucket.tokens = Math.min(bucket.tokens + refill, MAX_TOKENS);
   ```

## Also References
2. **apps/cloud/src/env.ts** — KVStore interface (state persistence)
3. **apps/cloud/src/routes/proxy.ts:48** — Reads Retry-After header
4. **apps/cloud/src/middleware/auth.ts** — Runs before rate-limit (userId source)
```

### Target output (post-gate, with specialized routing)
```
# route.issue: rate limiting bug — tokens don't refill correctly

## Crash Point
apps/cloud/src/middleware/rate-limit.ts:25 — Token bucket implementation
  `rateLimit()`
  ```typescript
  const elapsed = now - bucket.lastRefill;
  const refill = Math.floor(elapsed / 1000) * REFILL_RATE;
  ```

## Call Chain
auth.ts → rate-limit.ts → proxy.ts

## Co-change warning
rate-limit.ts + proxy.ts changed together 4x — update both.

## Blast radius
3 consumers: api.ts, proxy.ts, auth.ts
Tests: rate-limit.test.ts
```

## The Agent Workflow: Route → Load → Act

Claude shouldn't "search". Claude should:

```
Route → Load → Act
```

Where Route is LENS's product — specialized routing that gives the agent exactly what it needs based on query type.

### Specialized routing (not generic search)

| Tool | Input | Output | Beats grep because... |
|------|-------|--------|----------------------|
| `route.issue` | Stack trace + error | Crash point → call chain → tests → blast radius | Grep finds strings, not execution paths |
| `route.question` | "Where/how is X?" | Decision point → chain → co-change partners | Grep finds "login" in 47 files, not the decision point |
| `route.change` | "Change behavior Y" | Primary file → dependents → tests → risk | Grep can't show blast radius |
| `pack.build` | Selected files + focus | Key code sections + types + interfaces | Precision extraction, not file listing |

### Context slicing — the moat (shipped)

If LENS only outputs file lists, the agent still opens/scans and wastes time. Code slicing extracts:
- ±10 lines around resolved symbols (function signatures, key logic)
- Syntax-highlighted fenced blocks in the context pack
- Max 1-3 slices per query, progressively stripped if over token budget

This is what separates LENS from a better Grep. Agents receiving a LENS context pack can start editing without Read calls on symbol and error queries. Post-gate: 1-hop type expansion and structured slice outputs (`key_code`, `relevant_lines`, `imports_from`).

## Honest Risks & Competitive Landscape

LENS exists in a narrowing window. Acknowledging the threats keeps priorities sharp.

### Agents are getting better at orientation

Claude Code, Cursor, Copilot — each generation navigates codebases faster. Parallel sub-agents, growing context windows (200K+), cross-session memory, and project files like CLAUDE.md already cover ~80% of orientation for well-documented projects. The problem LENS solves is **real but shrinking**.

### Where LENS has durable value

Not everything agents can replicate cheaply:

- **Co-change clusters** — "these 2 files always change together" requires git history analysis. Agents can't derive this from grep.
- **Precomputed import graph** — agents build this file-by-file via Read. LENS has it instantly. Real savings on large codebases (1K+ files).
- **Structural relationships** — "auth → rate-limit → proxy" flow is expensive to discover cold.
- **Context slicing** (shipped) — extracting ±10 lines around resolved symbols, not whole files. Agents can reason about code structure from the context pack alone.

### Where LENS is thin

- **File ranking by TF-IDF** — Grep already returns relevant files. The ranking delta is small.
- **Purpose summaries** — useful, but CLAUDE.md + docstrings cover this for maintained projects. And generating them requires LLM calls.
- **"Start here" pointer** — agents figure this out in 1-2 Grep calls for most tasks.

### The benchmark gap

The initial n=3 exploratory benchmark was promising but not evidence. The eval harness (Phase 1, n=20) now provides repeatable measurement: Hit@3=95%, Recall@5=83%, avg 19ms. The targeted query overhead concern remains — LENS adds latency when the agent already knows where to look. Fresh A/B benchmarks (n=20+) at the GO/NO-GO gate will determine if the output improvements from Phases 2-3 translate to measurable agent productivity gains.

### Implication

**Prove value before building infrastructure.** Cloud/billing/deploy are premature until A/B benchmarks show LENS consistently beats a cold agent on exploratory tasks. The scoring engine and output are now solid — the question is whether agents *use the richer output* to work faster.

## Goals & Milestones

See [ROADMAP.md](ROADMAP.md) for the full implementation plan with phases, files, and validation criteria.

### G1: Evaluation harness (FIRST — non-negotiable) `✅ DONE`
20 gold questions, measurable Top-1/Top-3 hit rates. `lens eval` runs the harness, outputs per-query and per-kind scores. Baseline recorded 2026-02-15.

### G2: Rich context packs (formatter rewrite) `✅ DONE`
4 query-kind templates (natural/symbol/error/stack_trace). TOKEN_CAP 350→1200. Purpose summaries, full import paths, co-change counts always rendered. Bounded chunk content search for error queries. Noise exclusion (publish/, dist/ → score=0). Hit@3 85%→95%, natural 92%→100%, error 33%→67%, avg duration 37→15ms.

### G3: Context slicing — the moat `✅ DONE`
Code slices ship in all 4 context pack templates. `sliceContext()` extracts ±10 symmetric lines around resolved snippet anchors. Max 1-3 slices per query kind, syntax-highlighted fenced blocks. TOKEN_CAP 1200→2000. Progressive stripping drops slices first when over budget. Hit@3=95% (no regression), +4ms avg overhead. 1-hop type expansion deferred to post-gate.

### G4: GO/NO-GO gate `⬜ NEXT`
Re-run A/B benchmarks (n=20+) with the full Phase 1-3 engine. Does LENS consistently beat a cold agent on exploratory tasks? Eval harness already passes (Hit@3=95%, Recall@5=83%). A/B benchmarks will measure agent-level impact: tool calls saved, task completion rate, investigation quality.

### G5: Specialized routing (only after gate passes) `⬜ NOT STARTED`
Three MCP tools that each beat `get_context` on their use case. Stack traces resolve to source. "Where is X" finds the decision point. Change impact shows blast radius.

### G6: Symbiotic tool chain
LENS should feel like a natural first step, not an alternative:
- Vague/broad tasks → `route.question` first, then targeted Read
- Stack traces → `route.issue`, agent goes straight to the crash point
- Refactors → `route.change`, agent sees blast radius before touching code
- Specific lookups → skip LENS, Grep directly (don't slow down what's already fast)

## Design Principles

1. **Agent-first** — Built for AI consumption. The primary user is Claude Code, Cursor, or any MCP-capable agent. Human readability is a bonus, not the goal.
2. **Force multiplier, not replacement** — LENS doesn't replace Grep/Glob/Read. It makes every subsequent call more precise. The agent is still the one doing the work.
3. **Local-first** — Everything works offline. Cloud is optional enrichment (embeddings, purpose summaries).
4. **Deterministic retrieval** — No LLM in the query path. Scoring is math, not vibes. Fast, predictable, reproducible.
5. **Sub-second cached** — Context packs served in <100ms from cache. The headstart must be instant or agents won't use it.
6. **Zero config** — `lens repo register` + `lens context "goal"`. No schema files, no config, no training. If setup takes longer than 30 seconds, adoption fails.
7. **Transparent scoring** — Every file's rank is explainable (TF-IDF score + co-change boost + depth penalty). No black box.

## How Agents Should Use LENS

```
IF task is vague, broad, or unfamiliar codebase:
  1. lens context "<goal>"          # Get the briefing
  2. Read the top files LENS ranked  # Targeted investigation
  3. Grep/Glob for specifics         # Drill into details
  4. Do the actual work              # Write code, fix bugs

IF task is specific ("change line X in file Y"):
  Skip LENS, go directly to Read/Grep.
```

LENS is most valuable when the agent **doesn't know what it doesn't know**. A senior engineer's value isn't answering "what file is auth.ts?" — it's saying "you'll also need to update proxy.ts, and don't forget the KV state in env.ts."

## Target Users

1. **AI coding agents** (primary) — Claude Code, Cursor, Copilot, Windsurf, custom MCP clients. LENS is an MCP tool that agents call before diving into code.
2. **Developers in unfamiliar codebases** (secondary) — Onboarding, codebase exploration, impact analysis. Same value as for agents: instant orientation.
3. **Teams** (future) — Shared project knowledge that persists across sessions, team members, and agent instances.

## Success Metrics

| Metric | v0.1.x | v0.2.x (current) | Target |
|--------|--------|------------------|--------|
| Agent tool calls saved (exploratory) | ~26% fewer | TBD (GO/NO-GO) | 50% fewer |
| Agent answer completeness | +50% more findings | TBD (GO/NO-GO) | +100% (all relevant files found) |
| Context pack files returned | 1-2 | 5-7 with relationships | 5-7 with relationships ✅ |
| First useful Read after LENS | After 2-3 more searches | Immediate (file + line + code) | Immediate ✅ |
| Eval Hit@3 | 85% | 95% | >80% ✅ |
| Eval Recall@5 | 75% | 83% | >80% ✅ |
| Avg query latency | 37ms | 19ms (warm) | <200ms ✅ |
| Agent completes task within turn budget | 2/3 vs 1/3 | TBD (GO/NO-GO) | 95%+ with LENS |
