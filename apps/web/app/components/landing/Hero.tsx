import { useState } from "react";
import { Copy, Check } from "lucide-react";

// Static network graph nodes + edges for hero background
const nodes = [
  { x: 10, y: 15 }, { x: 25, y: 8 }, { x: 40, y: 22 }, { x: 55, y: 12 },
  { x: 70, y: 25 }, { x: 85, y: 10 }, { x: 15, y: 40 }, { x: 35, y: 45 },
  { x: 50, y: 38 }, { x: 65, y: 48 }, { x: 80, y: 42 }, { x: 92, y: 35 },
  { x: 8, y: 65 }, { x: 22, y: 72 }, { x: 45, y: 60 }, { x: 60, y: 70 },
  { x: 78, y: 62 }, { x: 90, y: 75 }, { x: 30, y: 85 }, { x: 50, y: 82 },
  { x: 72, y: 88 }, { x: 18, y: 55 }, { x: 48, y: 50 }, { x: 88, y: 55 },
];

const edges = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [0, 6], [6, 7], [7, 8],
  [8, 9], [9, 10], [10, 11], [6, 12], [12, 13], [13, 14], [14, 15],
  [15, 16], [16, 17], [18, 19], [19, 20], [2, 8], [8, 14], [4, 10],
  [10, 16], [1, 3], [7, 14], [9, 15], [21, 6], [21, 12], [22, 8],
  [22, 14], [23, 11], [23, 17], [13, 18], [15, 19], [16, 20],
];

export function Hero() {
  const [copied, setCopied] = useState(false);
  const installCmd = "npm install -g lens-engine";

  function copyToClipboard() {
    navigator.clipboard.writeText(installCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="relative overflow-hidden py-32">
      {/* Radial gradient base */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />

      {/* Network graph background */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.07]"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            stroke="currentColor"
            strokeWidth="0.15"
          />
        ))}
        {nodes.map((n, i) => (
          <circle
            key={i}
            cx={n.x}
            cy={n.y}
            r="0.4"
            fill="currentColor"
          />
        ))}
      </svg>

      {/* Fade edges */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_30%,_var(--color-background)_75%)]" />

      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">
          Index your codebase.
          <br />
          <span className="text-primary">Query with intent.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Give your AI agent the context it actually needs.
          LENS maps your repo — TF-IDF scoring, import graph traversal,
          co-change analysis — and delivers ranked files in one call.
          Fewer tokens wasted, smarter output.
        </p>

        {/* terminal box */}
        <div className="mx-auto mt-10 max-w-lg">
          <div className="overflow-hidden rounded-xl border bg-card shadow-2xl">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-red-500" />
              <span className="h-3 w-3 rounded-full bg-yellow-500" />
              <span className="h-3 w-3 rounded-full bg-green-500" />
              <span className="ml-2 text-xs text-muted-foreground">Terminal</span>
            </div>
            <div className="flex items-center justify-between px-5 py-4">
              <code className="font-mono text-sm text-card-foreground">
                <span className="text-muted-foreground">$ </span>
                {installCmd}
              </code>
              <button
                onClick={copyToClipboard}
                className="ml-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                aria-label="Copy install command"
              >
                {copied ? (
                  <Check className="size-4 text-success" />
                ) : (
                  <Copy className="size-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* CTAs */}
        <div className="mt-10 flex items-center justify-center gap-4">
          <a
            href="#how-it-works"
            className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Get Started
          </a>
          <a
            href="/docs"
            className="rounded-lg border bg-card px-6 py-3 text-sm font-semibold text-card-foreground transition-colors hover:bg-accent"
          >
            View Docs
          </a>
        </div>
      </div>
    </section>
  );
}
