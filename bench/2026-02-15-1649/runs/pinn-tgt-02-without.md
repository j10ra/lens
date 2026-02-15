The TanStack Query client is configured in:

**`src/app/shared-components/TanstackQueryProvider.tsx`**

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: false
    }
  }
});
```

It's wired into the app via the `withAppProviders` HOC at `src/app/withAppProviders.tsx:42`, wrapping the entire component tree:

```
ErrorBoundary
└── TanstackQueryProvider    ← QueryClientProvider here
    └── AppContext.Provider
        └── LocalizationProvider
            └── Provider (Redux store)
                └── App
```

The provider also includes lazy-loaded devtools toggleable via `window.ToggleDevTools()`.

---

## Report

- **Tool calls**: 5
- **Files read**: 4
- **Key findings**:
  - TanStack Query client configured in `src/app/shared-components/TanstackQueryProvider.tsx:10-17`
  - Default options: `refetchOnWindowFocus: true`, `retry: false`
  - Provider wired via `withAppProviders` HOC at `src/app/withAppProviders.tsx:42`
  - Devtools lazy-loaded, toggled via `window.ToggleDevTools()`
