const steps = [
  {
    number: "01",
    title: "Install & Register",
    description: "Install the CLI globally, then register your repo.",
    code: `$ npm install -g lens-engine
$ lens repo register /path/to/repo`,
  },
  {
    number: "02",
    title: "Index",
    description:
      "Build TF-IDF scores, import graph, and co-change analysis automatically.",
    code: `$ lens index

Scanning files... 847 files
Building import graph... done
Analyzing git history... done
Index complete in 2.3s`,
  },
  {
    number: "03",
    title: "Query",
    description:
      "Ask with intent. Get a context pack for your AI agent instantly.",
    code: `$ lens context "add auth middleware"

Context pack: 12 files, 3.2KB
  src/middleware/auth.ts
  src/routes/login.ts
  src/lib/tokens.ts
  ...`,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-zinc-800 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          How It Works
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-zinc-400">
          Three steps. No API keys required. Everything runs locally.
        </p>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.number}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-6"
            >
              <div className="mb-4 inline-block rounded-lg bg-blue-600/10 px-3 py-1 font-mono text-sm font-bold text-blue-500">
                {step.number}
              </div>
              <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
              <p className="mb-4 text-sm text-zinc-400">{step.description}</p>
              <div className="overflow-hidden rounded-lg bg-zinc-950 p-4">
                <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-zinc-300">
                  {step.code}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
