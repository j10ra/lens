The TanStack Query client is configured in the React external app at:

**`Project/src/web apps/react-web-external/src/app/shared-components/TanstackQueryProvider.tsx`**

Key configuration details:
- **QueryClient** instantiated at line 10 with default options:
  - `refetchOnWindowFocus: true` - refetches data when window regains focus
  - `retry: false` - disables automatic retry on failure
- **DevTools** lazy-loaded from `@tanstack/react-query-devtools/build/modern/production.js` (lines 19-23)
- **Toggle mechanism** - `window.ToggleDevTools()` function exposed globally to show/hide devtools (lines 28-30)

The provider is consumed in **`withAppProviders.tsx`** (line 42) which wraps the entire app context hierarchy.

## Report

- **Tool calls**: 2
- **Files read**: 2
- **Key findings**:
  - TanStack Query client configured in `TanstackQueryProvider.tsx` with `refetchOnWindowFocus: true` and `retry: false`
  - DevTools lazily loaded via `window.ToggleDevTools()` global toggle
  - Provider wraps app via `withAppProviders.tsx` HOC alongside Redux, MUI, and date-fns providers
