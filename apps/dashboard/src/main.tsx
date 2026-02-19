import "./styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "./router.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: true,
      retry: 2,
    },
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

ReactDOM.createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
);
