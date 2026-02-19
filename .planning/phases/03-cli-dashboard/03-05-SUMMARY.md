---
phase: 03-cli-dashboard
plan: 05
subsystem: ui
tags: [react, tailwind, tanstack-query, tanstack-store, shadcn]

requires:
  - phase: 03-04
    provides: "TraceStore queryTraces/querySpans, GET /traces and /traces/:traceId endpoints, @lens/ui Sheet/PageHeader/Separator"
provides:
  - "TraceWaterfall component with cycled Tailwind bar colors, proportional widths, depth indentation, error highlighting"
  - "Traces page with request log table (dense, sticky header) and detail Sheet"
  - "Router /traces route wired to Traces component"
affects: [03-06, 03-07]

tech-stack:
  added: []
  patterns:
    - "TanStack Store selectTrace/useSelectedTraceId — prevents re-renders on unrelated store changes"
    - "Depth map via recursive parent chain walk — computes visual nesting for span tree"
    - "min 2% bar width — ensures sub-millisecond spans are always visible"

key-files:
  created:
    - apps/dashboard/src/components/TraceWaterfall.tsx
    - apps/dashboard/src/pages/Traces.tsx
  modified:
    - apps/dashboard/src/router.tsx

key-decisions:
  - "TraceWaterfall uses index-based color cycling (not spanId hash) — preserves visual order, simpler code"
  - "Row click toggles selected trace — clicking selected row deselects (closes Sheet)"

requirements-completed: [DASH-02]

duration: 2min
completed: 2026-02-20
---

# Phase 3 Plan 05: Trace Waterfall Viewer Summary

**Horizontal span waterfall with cycled Tailwind colors inside a Sheet, backed by a dense request log table with 5s auto-refresh.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-19T12:56:08Z
- **Completed:** 2026-02-19T12:57:19Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- TraceWaterfall renders each span as a proportionally-sized horizontal bar; depth from parent chain walk gives visual nesting via left-padding; error spans use `bg-destructive`; colors cycle through blue/emerald/amber/purple/rose/cyan/orange
- Traces page shows dense table (#/Time/Route/Duration), clicking a row opens a Sheet with TraceWaterfall; `useTraces()` auto-refreshes every 5 seconds
- `/traces` route in router.tsx replaced placeholder div with `<Traces />`

## Task Commits

1. **Task 1: TraceWaterfall component** — `6387dd0`
2. **Task 2: Traces page + router update** — `68f8f64`

## Files Created/Modified

- `apps/dashboard/src/components/TraceWaterfall.tsx` — waterfall viz: depth map, sorted spans, proportional bars, color cycling, error highlighting
- `apps/dashboard/src/pages/Traces.tsx` — request log table, Sheet detail panel, TanStack Store state, @lens/ui imports
- `apps/dashboard/src/router.tsx` — `/traces` route wired to Traces component

## Decisions Made

- **Index-based color cycling:** `BAR_COLORS[i % BAR_COLORS.length]` by sorted position rather than a span ID hash. Preserves visual temporal order naturally.
- **Toggle-to-deselect:** Clicking an already-selected row calls `selectTrace(null)`, closing the Sheet. Avoids needing a separate close button in the table.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Traces viewer complete; 5/7 plans done in Phase 3
- Plans 03-06 (Repos/Files pages) and 03-07 (CLI polish) can proceed

---
*Phase: 03-cli-dashboard*
*Completed: 2026-02-20*

## Self-Check: PASSED

- FOUND: apps/dashboard/src/components/TraceWaterfall.tsx
- FOUND: apps/dashboard/src/pages/Traces.tsx
- FOUND commit: 6387dd0 (Task 1)
- FOUND commit: 68f8f64 (Task 2)
