# Pitfalls Research

**Domain:** Structured code query engine with observability (code intelligence tooling)
**Researched:** 2026-02-19
**Confidence:** HIGH (v1 benchmarks + post-mortems + domain-specific research)

## Critical Pitfalls

### Pitfall 1: Agent Tool Adoption Failure (0% Adoption Despite Availability)

**What goes wrong:**
AI agents (Claude, GPT, etc.) completely ignore MCP tools even when available, properly described, and contextually relevant. LENS v1 benchmarks proved this definitively: 0/9 MCP runs resulted in the agent calling LENS tools. The agent goes straight to Grep/Glob regardless of tool description wording, CLAUDE.md instructions, or task complexity.

**Why it happens:**
Agents have deeply ingrained tool selection heuristics. When they already have a working search strategy (Grep/Glob/Read), they don't evaluate new MCP tools. Tool descriptions are read but don't override established patterns. This is not a description quality problem -- it's a behavioral one. Anthropic's own research confirms: "too many tools or overlapping tools can distract agents from pursuing efficient strategies."

**How to avoid:**
1. Don't compete with Grep/Glob -- provide what they *can't*: structural context (callers, importers, co-change scores, hub status)
2. Design tools that produce *composite* results no single built-in tool can replicate
3. Consider MCP prompts (not just tools) to inject context at conversation start rather than waiting for tool calls
4. Tool consolidation: one `lens_query` returning graph context, not five granular tools
5. Return human-readable semantic output, not raw data dumps

**Warning signs:**
- Agents complete tasks without calling LENS tools
- Tool call logs show 0 LENS invocations across sessions
- Agent uses 10+ Grep calls to find what one LENS query could answer

**Phase to address:**
Phase 1 (Core + Engine). The MCP tool design must be validated before building everything on top.

---

### Pitfall 2: Graph Rendering Performance Cliff at Scale

**What goes wrong:**
Browser-based graph visualization works fine for 20-50 nodes but becomes unusable at 200+ nodes. This killed Sourcetrail's usability for large codebases -- "moving the slider to infinite depth level can result in huge graphs with thousands of nodes and edges." React Flow tests show FPS drops to 2 FPS for complex nodes without memoization, and force-directed layouts have O(n log n) time complexity minimum.

**Why it happens:**
Three compounding factors: (1) DOM rendering overhead -- each node is a React component with its own render cycle, (2) layout computation grows non-linearly, (3) state management triggers cascading re-renders. A common anti-pattern is directly accessing the `nodes` or `edges` arrays in components, causing re-renders on every drag/pan/zoom.

**How to avoid:**
1. Design for progressive disclosure from day one -- never render full graphs. Default to 1-level depth, expand on demand (Sourcetrail learned this the hard way)
2. Use deterministic layout (dagre for DAGs, not force-directed) to avoid layout instability
3. Memoize all custom node/edge components with `React.memo`
4. Decouple selection state from node/edge arrays -- maintain `selectedNodeIds` separately
5. Set a hard node limit (50-100 visible nodes max) with "expand" affordances
6. Consider graph partitioning -- render subgraphs, not the full import graph

**Warning signs:**
- Dashboard FPS drops below 30 when viewing a medium repo (50+ files)
- Layout jumps or shifts when adding/removing nodes
- Users report "it's slow" for repos larger than ~100 files

**Phase to address:**
Phase 3 (Dashboard). Must be architected correctly from first render. Retrofitting performance into a graph viz is a rewrite.

---

### Pitfall 3: Observability System Becomes the Bottleneck

**What goes wrong:**
The `lensFn()` tracing wrapper, designed to observe every engine function, becomes the performance bottleneck. SQLite writes for every span create I/O pressure. TraceStore grows unbounded. The observability layer meant to help debugging becomes the thing you need to debug.

**Why it happens:**
Tracing every function call generates high-volume data. In tight loops (indexing, graph traversal), span creation overhead dominates. SQLite's single-writer lock means trace writes block engine writes. Without retention policies, the trace database grows without limit -- SQLite doesn't reclaim space from deleted rows without VACUUM.

**How to avoid:**
1. Batch trace writes -- buffer spans in memory, flush periodically (not per-span)
2. Implement sampling for hot paths -- trace 100% of slow operations, sample fast ones
3. Add retention policy from day one: auto-delete traces older than N hours, VACUUM on schedule
4. Use WAL mode with proper checkpoint strategy to prevent WAL file growth
5. Make tracing opt-out for specific functions (e.g., `lensFn(fn, { trace: false })`)
6. Profile `lensFn` overhead early -- if wrapping adds >5% latency, redesign

**Warning signs:**
- `trace.db` file grows past 100MB
- Indexing time increases noticeably after enabling tracing
- WAL file grows unbounded (checkpoint starvation from concurrent reads)
- Dashboard trace waterfall takes seconds to load

**Phase to address:**
Phase 1 (Core). TraceStore design must include retention and batching from the start.

---

### Pitfall 4: Layout Instability in Graph Visualization

**What goes wrong:**
Graph layout changes on every render. Same input graph produces different node positions. Users lose spatial memory ("file X was in the top-left") and can't build mental models. Force-directed layouts are inherently non-deterministic -- they start from random positions and converge to local minima.

**Why it happens:**
Force-directed algorithms use random initialization. Different random seeds produce different layouts. Even with seeded randomness, adding or removing a single node can cascade into a completely different layout. The algorithm finds *a* local minimum, not *the* global minimum.

**How to avoid:**
1. Use dagre (deterministic hierarchical layout) for import graphs, not force-directed
2. If force-directed is needed for any view, seed the random generator and cache positions
3. Implement "anchor" nodes -- pinned positions for key files that don't move when graph changes
4. Animate transitions between layouts so users can track what moved
5. Store layout positions in state -- don't recompute on every render

**Warning signs:**
- Users complain "the graph keeps jumping"
- Same query produces visually different graphs on refresh
- Cognitive load increases instead of decreasing when using the graph view

**Phase to address:**
Phase 3 (Dashboard). Layout algorithm choice is an architectural decision, not a polish item.

---

### Pitfall 5: "Works for Own Repo" Blindness

**What goes wrong:**
The tool works perfectly on the developer's own codebase but fails on unfamiliar repos. v1 benchmarks showed this: RLM (own repo) scored 92.1% WITHOUT LENS vs 84.2% WITH -- the agent already knew the codebase. On Pinnacle (unfamiliar C# repo), LENS provided +15.8pp improvement. Optimizing for the known case misses the actual value proposition.

**Why it happens:**
Developers test against their own code, which they understand deeply. Structural signals that matter for unfamiliar codebases (hub files, entry points, architectural layers) are invisible when you already know the architecture. TF-IDF scoring gets tuned to the developer's vocabulary, not general patterns.

**How to avoid:**
1. Always test against at least 2 unfamiliar repos of different languages/frameworks
2. Benchmark on repos you've never seen before -- this is the target user experience
3. Focus scoring on "orientation" signals: what are the entry points? What are the layers? What changes together?
4. Don't optimize for targeted lookups (agent is already great at those) -- optimize for exploratory and debug tasks

**Warning signs:**
- All tests pass on your own repo but users report "it doesn't help"
- Benchmark scores are flat or negative on own codebase (this is expected, not a bug)
- Context pack lacks architectural overview information for unfamiliar repos

**Phase to address:**
Phase 2 (Engine). Scoring and context pack design must be validated against unfamiliar repos.

---

### Pitfall 6: SQLite Concurrent Access Under Load

**What goes wrong:**
SQLite's single-writer model causes "database is locked" errors when the daemon handles concurrent requests. Indexing (heavy writes) blocks trace writes. Dashboard reads trigger checkpoint starvation, preventing WAL cleanup. The TraceStore and engine index share the same connection, creating contention.

**Why it happens:**
SQLite uses database-level locks. Only one writer at a time. Long write transactions (indexing a large file set) block all other writes for their entire duration. WAL mode helps reads but doesn't solve write contention. Network filesystems are incompatible with WAL entirely.

**How to avoid:**
1. Separate databases: one for engine index, one for trace store. Different write patterns, no contention
2. Use WAL mode on both databases with `busy_timeout` set high (5000ms+)
3. Keep write transactions short -- batch index operations into small chunks, commit frequently
4. Never hold a write transaction open while doing I/O (e.g., reading files from disk)
5. Implement connection pooling awareness -- better-sqlite3 is synchronous, so use worker threads for heavy indexing

**Warning signs:**
- "SQLITE_BUSY" or "database is locked" errors in logs
- Indexing blocks dashboard responsiveness
- WAL file grows past 100MB (checkpoint starvation)

**Phase to address:**
Phase 1 (Core) for database separation. Phase 2 (Engine) for indexing transaction design.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single SQLite DB for traces + index | Simpler setup, one file | Write contention at scale, can't tune independently | Never -- separate from day one |
| No trace retention policy | "We'll add it later" | Disk fills up, dashboard slows, users lose trust | Never -- implement with TraceStore |
| Force-directed layout for all graphs | Quick to implement, looks dynamic | Non-deterministic, slow at scale, user disorientation | Only for exploratory/freeform views, never for import graph |
| Tracing every function synchronously | Complete observability | 5-20% latency overhead on hot paths | MVP only -- add sampling before Phase 2 |
| Monolithic MCP tool set (5+ tools) | Covers all use cases | Agents won't call any of them (proven by v1 benchmarks) | Never -- consolidate to 1-2 tools |
| Testing only on own codebase | Fast iteration, known results | False confidence, misses actual value prop | Never -- always include unfamiliar repo |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| MCP stdio transport | Assuming agents will discover and prefer MCP tools over built-in Grep/Glob | Design tools that return *composite* structural data no built-in tool can replicate. Consider MCP prompts for context injection. |
| better-sqlite3 + Drizzle | Using `drizzle-kit push` for schema changes in production | Always `drizzle-kit generate` + review migration SQL + `migrate()` on startup |
| Hono + MCP | Running both HTTP and stdio in same process, shared state | HTTP server and MCP stdio must share engine instance but have separate request contexts |
| React Flow + dagre | Computing layout on every render, inside React lifecycle | Compute layout outside React (or in useMemo), pass positions as props |
| SQLite WAL mode | Assuming WAL "just works" for concurrent access | Must configure `busy_timeout`, monitor WAL file size, implement checkpoint strategy |
| Git history analysis | Shelling out to `git log` for every query | Parse git history once during indexing, store co-change matrix in SQLite |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unbatched trace writes | Indexing 2-3x slower with tracing enabled | Buffer spans, flush every 100ms or 100 spans | >50 files indexed |
| Full graph rendering | Browser tab freezes, 2 FPS | Progressive disclosure, node limit, memoization | >100 nodes visible |
| TF-IDF on every query | Query latency >500ms on large repos | Pre-compute scores during indexing, cache in SQLite | >1000 files |
| Git log parsing per query | Multi-second latency for co-change queries | Index git history once, store in co-change table | >5000 commits |
| React Flow state churn | Dashboard janky during pan/zoom | Decouple selection from nodes array, use fine-grained selectors | >50 nodes with interactions |
| SQLite VACUUM never runs | Database file only grows, never shrinks | Schedule VACUUM after trace cleanup, auto-run on retention purge | >100MB database |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| MCP tool exposes file system read without path validation | Path traversal -- agent reads /etc/passwd or credentials | Restrict all file operations to the indexed repo root |
| No auth on daemon HTTP API (localhost:4111) | Any local process can query/modify index | Acceptable for local-first; document risk; add token auth if ever exposed beyond localhost |
| Git history exposes author emails | Privacy leak through co-change analysis | Hash or omit author identity -- store file pairs only, not who changed them |
| Trace data contains file contents | Indexed source code persisted in trace spans | Never include file contents in trace attributes -- only paths, scores, timing |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Requiring dashboard visits for value | Tool goes unused (Sourcetrail's failure mode) | Value must flow through MCP/CLI automatically -- dashboard is secondary |
| Full graph shown by default | Cognitive overload, user closes tab | Start with focus mode: queried file + 1 level of connections |
| No explanation of scores/rankings | "Why is this file ranked #3?" feels arbitrary | Show score breakdown: TF-IDF weight, import centrality, co-change frequency |
| Layout jumps on interaction | User loses spatial memory, stops trusting the graph | Deterministic layout + animated transitions + pinned positions |
| Slow initial index blocking usage | User abandons before seeing value | Progressive indexing: serve partial results immediately, complete in background |
| Trace waterfall too detailed | Information overload in observability view | Collapse by default, expandable spans, filter by duration threshold |

## "Looks Done But Isn't" Checklist

- [ ] **MCP Integration:** Tool is registered but verify agents actually *call* it in real tasks -- registration != adoption
- [ ] **Graph Viz:** Renders correctly at 20 nodes but verify at 200 nodes with real import graphs
- [ ] **Trace Waterfall:** Shows spans but verify it handles 1000+ spans without freezing
- [ ] **SQLite:** Works in dev but verify under concurrent read/write load (index + query + trace simultaneously)
- [ ] **TF-IDF Scoring:** Returns results but verify ranking quality against manual expert judgment on unfamiliar repos
- [ ] **Co-change Analysis:** Parses git log but verify on repos with 10K+ commits and merge-heavy histories
- [ ] **Import Graph:** Resolves TypeScript imports but verify with path aliases, barrel files, and circular imports
- [ ] **Retention Policy:** Deletes old traces but verify VACUUM reclaims disk space after purge
- [ ] **Dashboard Responsiveness:** Fast on localhost but verify over network (daemon on remote machine)
- [ ] **Progressive Disclosure:** Focus mode works but verify "expand" correctly loads adjacent nodes without layout reset

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Agent tool adoption failure | MEDIUM | Redesign MCP tool interface: consolidate tools, use prompts not just tools, return composite structural data. Requires re-benchmarking. |
| Graph rendering perf cliff | HIGH | Requires architectural change: add virtualization, switch layout algorithm, implement node pooling. Partial rewrite of graph component. |
| Observability bottleneck | MEDIUM | Add batching layer between lensFn and TraceStore. Add sampling. Separate databases. No API changes needed. |
| Layout instability | MEDIUM | Switch from force-directed to dagre. Cache positions. Add animation. Layout code is isolated if component boundaries are clean. |
| "Own repo" blindness | LOW | Add unfamiliar repo to test suite. Adjust scoring weights. No architectural change needed. |
| SQLite contention | MEDIUM | Split into separate databases. Add busy_timeout. Shorten transactions. May require schema migration. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Agent tool adoption (0/9) | Phase 1: Core + MCP tool design | Run 10+ MCP benchmarks on unfamiliar repos. Target >30% adoption rate. |
| Graph rendering performance | Phase 3: Dashboard | Profile at 200 nodes. Maintain >30 FPS. Hard-cap visible nodes at 100. |
| Observability bottleneck | Phase 1: Core (TraceStore) | Measure indexing time with/without tracing. Overhead must be <10%. |
| Layout instability | Phase 3: Dashboard | Same query must produce identical layout on refresh. No visible jumps during interaction. |
| "Own repo" blindness | Phase 2: Engine | Benchmark scoring on 3+ unfamiliar repos. Score quality must match or beat own-repo results. |
| SQLite contention | Phase 1: Core (DB separation) | Concurrent index + query + trace writes without SQLITE_BUSY errors. |
| Unbounded trace growth | Phase 1: Core (TraceStore) | trace.db stays under 50MB with default retention. VACUUM runs automatically. |
| MCP tool description quality | Phase 1: MCP integration | Tool descriptions reviewed against Anthropic's best practices. Namespaced, consolidated, semantic output. |
| TF-IDF false confidence | Phase 2: Engine scoring | Validate top-5 results against expert judgment on 3+ repos. False positive rate <20%. |
| Dashboard "context switch" friction | Phase 3: Dashboard UX | Primary value must flow through MCP/CLI. Dashboard visit rate is secondary metric. |

## Sources

- [Sourcetrail Discontinuation HN Discussion](https://news.ycombinator.com/item?id=28637193) -- monetization failure, graph scale issues, infrequent use case
- [GitKraken CodeSee Acquisition](https://www.gitkraken.com/blog/gitkraken-launches-devex-platform-acquires-codesee) -- code viz absorbed into larger platform
- [React Flow Performance Guide](https://reactflow.dev/learn/advanced-use/performance) -- memoization, state decoupling, node limits
- [SQLite WAL Mode Documentation](https://sqlite.org/wal.html) -- checkpoint starvation, single-writer model, network FS incompatibility
- [SQLite Concurrent Writes Analysis](https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/) -- write lock behavior, busy timeout
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3) -- performance characteristics, inappropriate use cases
- [Anthropic: Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents) -- tool consolidation, semantic identifiers, error messages
- [MCP Tool Description Quality Research](https://arxiv.org/html/2602.14878v1) -- tool description "smells", agent selection behavior
- [MCP Transport Future](http://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future/) -- stdio vs HTTP stream transport evolution
- [Force-Directed Graph Drawing (Wikipedia)](https://en.wikipedia.org/wiki/Force-directed_graph_drawing) -- random initialization, local minima, non-determinism
- [D3 Force Layout Optimization](https://dzone.com/articles/d3-force-directed-graph-layout-optimization-in-neb) -- O(n log n) complexity, browser freezing thresholds
- [OpenTelemetry Best Practices](https://betterstack.com/community/guides/observability/opentelemetry-best-practices/) -- batch processing, sampling, noise reduction
- [SQLite Performance Optimization Guide](https://forwardemail.net/en/blog/docs/sqlite-performance-optimization-pragma-chacha20-production-guide) -- PRAGMA settings, WAL tuning
- [Stack Overflow 2025 Developer Survey](https://stackoverflow.blog/2025/12/29/developers-remain-willing-but-reluctant-to-use-ai-the-2025-developer-survey-results-are-here) -- 52% don't use agents or stick to simpler tools
- LENS v1 Benchmarks (internal: `bench/2026-02-15-*/results.md`) -- 0/9 MCP adoption, +15.8pp on unfamiliar repos, misdirection on own repo

---
*Pitfalls research for: Structured code query engine with observability*
*Researched: 2026-02-19*
