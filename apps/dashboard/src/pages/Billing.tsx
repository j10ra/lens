import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { api } from "@/lib/api";
import { CloudAuthGuard } from "@/components/CloudAuthGuard";
import { PageHeader } from "@lens/ui";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["Unlimited local context queries", "TF-IDF + Import graph", "MCP integration", "1 API key"],
  },
  {
    name: "Pro",
    price: "$9",
    period: "/mo",
    features: ["Everything in Free", "Voyage embeddings", "Purpose summaries", "Vocab clusters", "5 API keys"],
  },
];

function BillingContent() {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["cloud-subscription"],
    queryFn: api.cloudSubscription,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const sub = data?.subscription;
  const currentPlan = sub?.plan ?? "free";
  const isActive = sub?.status === "active";
  const nextBilling = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  async function handleUpgrade() {
    setActionLoading("checkout");
    try {
      const result = await api.cloudCheckout();
      if (result.url) window.location.href = result.url;
    } finally {
      setActionLoading(null);
    }
  }

  async function handleManage() {
    setActionLoading("portal");
    try {
      const result = await api.cloudPortal();
      if (result.url) window.location.href = result.url;
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Billing</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage your subscription and payment method.</p>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Current Plan</p>
            <p className="mt-1 text-xl font-bold capitalize">
              {currentPlan}{" "}
              {currentPlan === "pro" && <span className="text-sm font-normal text-muted-foreground">&mdash; $9/mo</span>}
            </p>
          </div>
          <div className={`inline-flex items-center rounded-full border px-3 py-1 ${isActive ? "border-success/30 bg-success/10" : "border-border bg-muted"}`}>
            <span className={`text-xs font-medium ${isActive ? "text-success" : "text-muted-foreground"}`}>
              {sub?.status ? sub.status.charAt(0).toUpperCase() + sub.status.slice(1) : "Active"}
            </span>
          </div>
        </div>
        {nextBilling && (
          <div className="mt-4 flex items-center gap-4 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              {sub?.cancelAtPeriodEnd ? "Access until: " : "Next billing date: "}
              <span className="text-foreground">{nextBilling}</span>
            </p>
          </div>
        )}
        {currentPlan === "pro" && sub?.stripeCustomerId && (
          <div className="mt-4 flex gap-3">
            <button onClick={handleManage} disabled={actionLoading !== null} className="rounded-lg bg-secondary px-4 py-2 text-sm hover:bg-accent disabled:opacity-50">
              {actionLoading === "portal" ? "Loading..." : "Manage Subscription"}
            </button>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-4 text-sm font-semibold">Available Plans</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {PLANS.map((plan) => {
            const isCurrent = plan.name.toLowerCase() === currentPlan;
            return (
              <div key={plan.name} className={`rounded-xl border p-6 ${isCurrent ? "border-primary/50 bg-card ring-1 ring-primary/20" : "border-border bg-card"}`}>
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">{plan.name}</h4>
                  {isCurrent && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">Current</span>}
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">{plan.period}</span>
                </div>
                <ul className="mt-4 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="size-4 text-success" /> {f}
                    </li>
                  ))}
                </ul>
                {!isCurrent && plan.name === "Pro" && (
                  <button onClick={handleUpgrade} disabled={actionLoading !== null} className="mt-6 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {actionLoading === "checkout" ? "Loading..." : "Upgrade to Pro"}
                  </button>
                )}
                {!isCurrent && plan.name === "Free" && (
                  <button onClick={handleManage} disabled={actionLoading !== null} className="mt-6 w-full rounded-lg bg-secondary py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50">
                    {actionLoading === "portal" ? "Loading..." : "Downgrade to Free"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Billing() {
  return (
    <>
      <PageHeader><h1 className="text-sm font-semibold">Billing</h1></PageHeader>
      <main className="flex-1 overflow-auto p-4 lg:p-6">
        <CloudAuthGuard><BillingContent /></CloudAuthGuard>
      </main>
    </>
  );
}
