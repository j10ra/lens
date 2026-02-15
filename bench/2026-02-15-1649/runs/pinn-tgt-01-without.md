## Report

- **Tool calls**: 8
- **Files read**: 6
- **Key findings**:
  - **Primary hook**: `useSearchVisitsByFilter` at `src/app/services/container-visit/useSearchVisitsByFilter.ts:27` - TanStack Query hook that POSTs to `/search-container-by-filter` endpoint
  - **Filter state management**: `useFormFilter` at `src/app/main/external/admin/container-visit/visit/components/FormFilter/useFormFilter.ts:20` - Zustand store persisting filter state via `appStateManager`
  - **Component composition**: `ContainerVisitScreen` → `FormFilter` (sidebar) + `ContainerGrid` (results) - filter data flows from Zustand store to query hook
  - **Data flow**: FormFilter updates Zustand → ContainerGrid reads `filterData` → calls `useSearchVisitsByFilter` → renders `QubeDataGrid` with results
