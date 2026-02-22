const steps = [
  {
    number: "01",
    title: "Install & Start",
    description: "Install the CLI globally and start the background daemon.",
    code: `$ npm install -g lens-engine
$ lens daemon start`,
  },
  {
    number: "02",
    title: "Register & Index",
    description:
      "Register a repo — indexing kicks off automatically. TF-IDF, import graph, and git history in one pass.",
    code: `$ lens register .

Registered: my-project
Scanning files... 847 files
Building import graph... done
Analyzing git history... done
Index complete in 2.3s`,
  },
  {
    number: "03",
    title: "Query",
    description:
      "Search with pipe-separated terms. Get ranked results with structural context.",
    code: `$ lens grep "auth|middleware|session"

[auth] 12 results
  src/middleware/auth.ts  [hub]  0.94
    importers: routes/login.ts, routes/api.ts
  src/lib/tokens.ts             0.87
    importers: middleware/auth.ts
  ...`,
  },
];

type Token = { text: string; cls?: string };

const CODE = {
  prompt: "text-muted-foreground/60",
  cmd: "text-primary",
  flag: "text-success",
  output: "text-foreground/80",
  info: "text-muted-foreground",
  path: "text-primary/85",
  dim: "text-muted-foreground/70",
} as const;

function highlightLine(line: string): Token[] {
  if (!line) return [{ text: " " }];

  if (line.startsWith("$ ")) {
    const tokens: Token[] = [{ text: "$ ", cls: CODE.prompt }];
    const rest = line.slice(2);
    const parts = rest.split(/(\s+)/);
    let seenCmd = false;

    for (const part of parts) {
      if (/^\s+$/.test(part)) {
        tokens.push({ text: part });
      } else if (!seenCmd) {
        tokens.push({ text: part, cls: CODE.cmd });
        seenCmd = true;
      } else if (part.startsWith("-")) {
        tokens.push({ text: part, cls: CODE.flag });
      } else {
        tokens.push({ text: part });
      }
    }

    return tokens;
  }

  const trimmed = line.trimStart();
  if (trimmed.startsWith("src/")) return [{ text: line, cls: CODE.path }];
  if (trimmed === "...") return [{ text: line, cls: CODE.dim }];
  if (trimmed.includes("done")) return [{ text: line, cls: CODE.output }];

  return [{ text: line, cls: CODE.info }];
}

function renderCode(code: string) {
  return code.split("\n").map((line, i) => {
    const tokens = highlightLine(line);
    const commandGap = i > 0 && line.startsWith("$ ") ? "mt-2.5" : "";

    return (
      <div key={`${i}-${line}`} className={commandGap}>
        {tokens.map((token, j) => (
          <span key={`${j}-${token.text}`} className={token.cls}>
            {token.text}
          </span>
        ))}
      </div>
    );
  });
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-border py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          How It Works
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
          Three commands. No API keys. Your code never leaves your machine.
        </p>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.number}
              className="rounded-xl border bg-card p-6"
            >
              <div className="mb-4 inline-block rounded-lg bg-primary/10 px-3 py-1 font-mono text-sm font-bold text-primary">
                {step.number}
              </div>
              <h3 className="mb-2 text-lg font-semibold text-card-foreground">{step.title}</h3>
              <p className="mb-4 text-sm text-muted-foreground">{step.description}</p>
              <div className="overflow-hidden rounded-lg border border-border/60 bg-background/70">
                <div className="h-1 bg-gradient-to-r from-primary/30 via-primary/10 to-transparent" />
                <pre className="overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed">
                  {renderCode(step.code)}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
