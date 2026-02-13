import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function CloudAuthGuard({ children }: { children: React.ReactNode }) {
  const auth = useQuery({
    queryKey: ["auth-status"],
    queryFn: api.authStatus,
    placeholderData: keepPreviousData,
  });

  if (!auth.isLoading && !auth.data?.authenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="rounded-xl border bg-card p-8 text-center max-w-sm">
          <h2 className="text-lg font-semibold text-card-foreground">Cloud Not Connected</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Authenticate with the LENS cloud to manage API keys, usage, and billing.
          </p>
          <code className="mt-4 block rounded-lg bg-muted px-4 py-2 text-sm font-mono">lens login</code>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
