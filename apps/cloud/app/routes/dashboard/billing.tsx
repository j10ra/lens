import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "../dashboard";
import { getSubscription, createCheckoutSession, getPortalUrl } from "@/lib/server-fns";

export const Route = createFileRoute("/dashboard/billing")({
  component: BillingPage,
});

interface Subscription {
  plan: string | null;
  status: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
  stripeCustomerId: string | null;
}

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: [
      "Unlimited local context queries",
      "TF-IDF + Import graph",
      "MCP integration",
      "1 API key",
    ],
  },
  {
    name: "Pro",
    price: "$9",
    period: "/mo",
    features: [
      "Everything in Free",
      "Voyage embeddings",
      "Purpose summaries",
      "Vocab clusters",
      "5 API keys",
    ],
  },
];

function BillingPage() {
  const { userId } = useAuth();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const data = await getSubscription({ data: { userId } });
      setSub(data);
      setLoading(false);
    })();
  }, [userId]);

  const currentPlan = sub?.plan ?? "free";
  const isActive = sub?.status === "active";
  const nextBilling = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  async function handleManageSubscription() {
    setActionLoading("portal");
    try {
      const result = await getPortalUrl({ data: { userId } });
      if (result.url) window.location.href = result.url;
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUpgrade() {
    setActionLoading("checkout");
    try {
      const result = await createCheckoutSession({ data: { userId } });
      if (result.url) window.location.href = result.url;
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Billing</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Manage your subscription and payment method.
        </p>
      </div>

      {/* Current plan */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-400">Current Plan</p>
            <p className="mt-1 text-xl font-bold capitalize">
              {currentPlan}{" "}
              {currentPlan === "pro" && (
                <span className="text-sm font-normal text-zinc-400">
                  &mdash; $9/mo
                </span>
              )}
            </p>
          </div>
          <div
            className={`inline-flex items-center rounded-full border px-3 py-1 ${
              isActive
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-zinc-700 bg-zinc-800"
            }`}
          >
            <span
              className={`text-xs font-medium ${
                isActive ? "text-emerald-400" : "text-zinc-400"
              }`}
            >
              {sub?.status ? sub.status.charAt(0).toUpperCase() + sub.status.slice(1) : "Active"}
            </span>
          </div>
        </div>

        {nextBilling && (
          <div className="mt-4 flex items-center gap-4 border-t border-zinc-800 pt-4">
            <p className="text-sm text-zinc-400">
              {sub?.cancelAtPeriodEnd ? "Access until: " : "Next billing date: "}
              <span className="text-zinc-300">{nextBilling}</span>
            </p>
          </div>
        )}

        {currentPlan === "pro" && sub?.stripeCustomerId && (
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleManageSubscription}
              disabled={actionLoading !== null}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
            >
              {actionLoading === "portal" ? "Loading..." : "Manage Subscription"}
            </button>
          </div>
        )}
      </div>

      {/* Plan comparison */}
      <div>
        <h3 className="mb-4 text-sm font-semibold text-zinc-300">
          Available Plans
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {PLANS.map((plan) => {
            const isCurrent = plan.name.toLowerCase() === currentPlan;
            return (
              <div
                key={plan.name}
                className={`rounded-xl border p-6 ${
                  isCurrent
                    ? "border-blue-500/50 bg-zinc-900 ring-1 ring-blue-500/20"
                    : "border-zinc-800 bg-zinc-900"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">{plan.name}</h4>
                  {isCurrent && (
                    <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400">
                      Current
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-sm text-zinc-400">{plan.period}</span>
                </div>
                <ul className="mt-4 space-y-2">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm text-zinc-400"
                    >
                      <svg
                        className="h-4 w-4 text-emerald-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                {!isCurrent && plan.name === "Pro" && (
                  <button
                    onClick={handleUpgrade}
                    disabled={actionLoading !== null}
                    className="mt-6 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                  >
                    {actionLoading === "checkout" ? "Loading..." : "Upgrade to Pro"}
                  </button>
                )}
                {!isCurrent && plan.name === "Free" && (
                  <button
                    onClick={handleManageSubscription}
                    disabled={actionLoading !== null}
                    className="mt-6 w-full rounded-lg bg-zinc-800 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
                  >
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
