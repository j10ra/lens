import { PageHeader } from "@lens/ui";
import { useQuery } from "@tanstack/react-query";
import { Check, Mail } from "lucide-react";
import { useState } from "react";
import { CloudAuthGuard } from "@/components/CloudAuthGuard";
import { api } from "@/lib/api";

type Interval = "monthly" | "yearly";

const PRO_FEATURES = [
  "Everything in Free",
  "Voyage embeddings",
  "Purpose summaries",
  "Vocab clusters",
];

function BillingContent() {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["cloud-subscription"],
    queryFn: api.cloudSubscription,
  });

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div>
          <div className="h-7 w-32 rounded bg-muted" />
          <div className="mt-2 h-4 w-64 rounded bg-muted" />
        </div>
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="mt-2 h-6 w-20 rounded bg-muted" />
            </div>
            <div className="h-7 w-16 rounded-full bg-muted" />
          </div>
        </div>
        <div>
          <div className="mb-4 h-4 w-28 rounded bg-muted" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card p-6"
              >
                <div className="h-5 w-20 rounded bg-muted" />
                <div className="mt-3 h-8 w-16 rounded bg-muted" />
                <div className="mt-4 space-y-2">
                  {[0, 1, 2].map((j) => (
                    <div key={j} className="h-4 w-3/4 rounded bg-muted" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const sub = data?.subscription;
  const currentPlan = sub?.plan ?? "free";
  const isActive = sub?.status === "active";
  const nextBilling = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  async function handleUpgrade(interval: Interval) {
    setActionLoading(interval);
    try {
      const result = await api.cloudCheckout(interval);
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

  const isFree = currentPlan === "free";
  const isPro = currentPlan === "pro";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Billing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your subscription and payment method.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Current Plan</p>
            <p className="mt-1 text-xl font-bold capitalize">
              {currentPlan}{" "}
              {isPro && (
                <span className="text-sm font-normal text-muted-foreground">
                  &mdash; $9/mo
                </span>
              )}
            </p>
          </div>
          <div
            className={`inline-flex items-center rounded-full border px-3 py-1 ${isActive ? "border-success/30 bg-success/10" : "border-border bg-muted"}`}
          >
            <span
              className={`text-xs font-medium ${isActive ? "text-success" : "text-muted-foreground"}`}
            >
              {sub?.status
                ? sub.status.charAt(0).toUpperCase() + sub.status.slice(1)
                : "Active"}
            </span>
          </div>
        </div>
        {nextBilling && (
          <div className="mt-4 flex items-center gap-4 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              {sub?.cancelAtPeriodEnd
                ? "Access until: "
                : "Next billing date: "}
              <span className="text-foreground">{nextBilling}</span>
            </p>
          </div>
        )}
        {isPro && sub?.stripeCustomerId && (
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleManage}
              disabled={actionLoading !== null}
              className="rounded-lg bg-secondary px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              {actionLoading === "portal"
                ? "Loading..."
                : "Manage Subscription"}
            </button>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-4 text-sm font-semibold">Available Plans</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Free */}
          <div
            className={`rounded-xl border p-6 ${isFree ? "border-primary/50 ring-1 ring-primary/20" : "border-border"} bg-card`}
          >
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Free</h4>
              {isFree && (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  Current
                </span>
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-bold">$0</span>
              <span className="text-sm text-muted-foreground">forever</span>
            </div>
            <ul className="mt-4 space-y-2">
              {[
                "Unlimited local context queries",
                "TF-IDF + Import graph",
                "MCP integration",
              ].map((f) => (
                <li
                  key={f}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Check className="size-4 text-success" /> {f}
                </li>
              ))}
            </ul>
            {isPro && (
              <button
                onClick={handleManage}
                disabled={actionLoading !== null}
                className="mt-6 w-full rounded-lg bg-secondary py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                {actionLoading === "portal"
                  ? "Loading..."
                  : "Downgrade to Free"}
              </button>
            )}
          </div>

          {/* Pro Monthly */}
          <div
            className={`rounded-xl border p-6 ${isPro ? "border-primary/50 ring-1 ring-primary/20" : "border-border"} bg-card`}
          >
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Pro</h4>
              {isPro && (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  Current
                </span>
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-bold">$9</span>
              <span className="text-sm text-muted-foreground">/mo</span>
            </div>
            <ul className="mt-4 space-y-2">
              {PRO_FEATURES.map((f) => (
                <li
                  key={f}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Check className="size-4 text-success" /> {f}
                </li>
              ))}
            </ul>
            {isFree && (
              <button
                onClick={() => handleUpgrade("monthly")}
                disabled={actionLoading !== null}
                className="mt-6 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {actionLoading === "monthly" ? "Loading..." : "Go Monthly"}
              </button>
            )}
          </div>

          {/* Pro Yearly */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Pro Yearly</h4>
              <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                Save 17%
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-bold">$90</span>
              <span className="text-sm text-muted-foreground">/yr</span>
            </div>
            <ul className="mt-4 space-y-2">
              {PRO_FEATURES.map((f) => (
                <li
                  key={f}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Check className="size-4 text-success" /> {f}
                </li>
              ))}
            </ul>
            {isFree && (
              <button
                onClick={() => handleUpgrade("yearly")}
                disabled={actionLoading !== null}
                className="mt-6 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {actionLoading === "yearly" ? "Loading..." : "Go Yearly"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Enterprise */}
      <a
        href="mailto:support@lens.dev?subject=LENS Enterprise Inquiry"
        className="flex items-center justify-between rounded-xl border border-border bg-card p-5 transition-colors hover:bg-accent"
      >
        <div>
          <p className="text-sm font-semibold">Enterprise</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Dedicated support, custom integrations, SLA guarantee
          </p>
        </div>
        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Mail className="size-4" /> Contact Sales
        </span>
      </a>
    </div>
  );
}

export function Billing() {
  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-semibold">Billing</h1>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 lg:p-6">
        <CloudAuthGuard>
          <BillingContent />
        </CloudAuthGuard>
      </main>
    </>
  );
}
