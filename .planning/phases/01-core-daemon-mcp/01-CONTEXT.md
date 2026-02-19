# Phase 1: Core + Daemon + MCP - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

The observability framework (`lensFn`, `lensRoute`, Logger, TraceStore), Hono HTTP daemon on :4111, MCP stdio server with agent-adoption-validated tool design, and CLI skeleton. This is the foundation everything else wraps around — API shape decisions here are locked for all subsequent phases.

</domain>

<decisions>
## Implementation Decisions

### Logger Design
- Inside `lensFn()` → logs auto-attach to active span (traceId + spanId). Outside → standalone structured output.
- Dual output: stdout AND SQLite persistence (TraceStore)
- Minimal fields per entry: timestamp, level, message, traceId, spanId
- Stdout format: human-readable by default, `--json` flag for structured JSON (one object per line, pipe to jq)
- Levels: info, warn, error, debug

### Claude's Discretion
- `lensFn()` / `lensRoute()` API shape — sync vs async, ctx object design, span nesting model
- Trace storage schema — flat vs hierarchical spans, what fields per trace/span
- MCP tool naming and description — follow Anthropic's published tool design guidance
- Trace retention policy — default window, prune strategy
- Daemon route structure and error responses
- CLI argument parser choice

</decisions>

<specifics>
## Specific Ideas

- Logger should feel like Encore.ts's built-in logging — zero-config, just works when you use `ctx.log.info()`
- `lensFn()` is the foundational primitive — the Encore-like DX where functions are "managed" by the framework
- MCP adoption is the existential risk (0/9 in v1). Phase 1 plan 04 is a benchmark gate — do not start Phase 2 until adoption confirmed on unfamiliar repos.
- Two separate SQLite databases: engine index + trace store. Separate write patterns, no contention.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-core-daemon-mcp*
*Context gathered: 2026-02-19*
