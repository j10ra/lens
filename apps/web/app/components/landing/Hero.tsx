import { useState } from "react";

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
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-zinc-950 to-zinc-950" />
      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">
          Index your codebase.
          <br />
          <span className="text-blue-500">Query with intent.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
          LENS indexes your repos locally and serves context packs to AI agents.
          Zero LLM calls on the query path.
        </p>

        {/* terminal box */}
        <div className="mx-auto mt-10 max-w-lg">
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
            <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-red-500" />
              <span className="h-3 w-3 rounded-full bg-yellow-500" />
              <span className="h-3 w-3 rounded-full bg-green-500" />
              <span className="ml-2 text-xs text-zinc-500">Terminal</span>
            </div>
            <div className="flex items-center justify-between px-5 py-4">
              <code className="font-mono text-sm text-zinc-300">
                <span className="text-zinc-500">$ </span>
                {installCmd}
              </code>
              <button
                onClick={copyToClipboard}
                className="ml-4 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                aria-label="Copy install command"
              >
                {copied ? (
                  <svg
                    className="h-4 w-4 text-emerald-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* CTAs */}
        <div className="mt-10 flex items-center justify-center gap-4">
          <a
            href="#how-it-works"
            className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            Get Started
          </a>
          <a
            href="https://github.com/j10ra/lens"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-6 py-3 text-sm font-semibold text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
