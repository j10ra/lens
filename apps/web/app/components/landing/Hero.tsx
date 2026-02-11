import { useState } from "react";
import { Copy, Check } from "lucide-react";

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
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />
      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">
          Index your codebase.
          <br />
          <span className="text-primary">Query with intent.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Give your AI agent the context it actually needs.
          LENS understands your repo's structure — imports, dependencies,
          git history — and delivers the right files in one call.
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
