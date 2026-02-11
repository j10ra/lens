import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/docs/")({
  component: DocsIndex,
});

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="overflow-hidden rounded-lg bg-card p-4">
      <pre className="overflow-x-auto font-mono text-sm leading-relaxed text-card-foreground">
        {children}
      </pre>
    </div>
  );
}

const cliCommands = [
  { command: "lens daemon start", description: "Start the HTTP daemon on :4111" },
  { command: "lens daemon stop", description: "Stop the running daemon" },
  { command: "lens daemon stats", description: "Show global statistics" },
  { command: "lens repo register", description: "Register current repo for indexing" },
  { command: "lens repo list", description: "List registered repos" },
  { command: "lens repo remove", description: "Remove current repo" },
  { command: "lens repo watch", description: "Start file watcher for current repo" },
  { command: "lens repo unwatch", description: "Stop file watcher for current repo" },
  { command: "lens repo watch-status", description: "Show watcher status" },
  { command: "lens index", description: "Index the current repo" },
  { command: 'lens context "<goal>"', description: "Build a context pack for a goal" },
  { command: "lens status", description: "Show repo index/embedding status" },
  { command: "lens dashboard", description: "Open local dashboard in browser" },
  { command: "lens login", description: "Authenticate via OAuth (GitHub/Google)" },
  { command: "lens logout", description: "Clear cloud authentication" },
  { command: "lens config get <key>", description: "Get a config value" },
  { command: "lens config set <key> <val>", description: "Set a config value" },
];

function DocsIndex() {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Getting Started
        </h1>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          LENS indexes your codebase locally and serves context packs to AI
          agents. No API keys required for local-only usage.
        </p>
      </div>

      {/* Install */}
      <section>
        <h2 className="text-xl font-semibold">Install</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Install LENS globally via npm.
        </p>
        <div className="mt-4">
          <CodeBlock>$ npm install -g lens-engine</CodeBlock>
        </div>
      </section>

      {/* Quick Start */}
      <section>
        <h2 className="text-xl font-semibold">Quick Start</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Start the daemon, register your repo, and query in seconds.
        </p>
        <div className="mt-4 space-y-3">
          <CodeBlock>{`$ lens daemon start
LENS daemon running on http://localhost:4111

$ lens repo register
Registered: my-project (847 files)

$ lens index
Scanning files... 847 files
Building import graph... done
Analyzing git history... done
Index complete in 2.3s

$ lens context "add auth middleware"
Context pack: 12 files, 3.2KB
  src/middleware/auth.ts
  src/routes/login.ts
  src/lib/tokens.ts
  ...`}</CodeBlock>
        </div>
      </section>

      {/* Daemon */}
      <section>
        <h2 className="text-xl font-semibold">Daemon Mode</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          The daemon runs on port 4111 and serves the REST API, MCP stdio, and
          local dashboard.
        </p>
        <div className="mt-4">
          <CodeBlock>{`$ lens daemon start
LENS daemon running on http://localhost:4111

$ lens dashboard
Opening http://localhost:4111/dashboard/

$ curl http://localhost:4111/context \\
  -H "Content-Type: application/json" \\
  -d '{"goal": "add auth middleware"}'`}</CodeBlock>
        </div>
      </section>

      {/* Pro Features */}
      <section>
        <h2 className="text-xl font-semibold">Pro Features</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Authenticate to unlock Voyage semantic embeddings, purpose summaries,
          and vocab clusters.
        </p>
        <div className="mt-4">
          <CodeBlock>{`$ lens login --github
Authenticated as user@example.com

$ lens status
Pro: active
Embeddings: 847/847 files
Vocab clusters: 42 clusters`}</CodeBlock>
        </div>
      </section>

      {/* MCP Setup */}
      <section>
        <h2 className="text-xl font-semibold">MCP Integration</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Claude Code auto-discovers LENS via{" "}
          <code className="rounded bg-card px-1.5 py-0.5 text-xs">.mcp.json</code>{" "}
          in your project root. Create the file:
        </p>
        <div className="mt-4">
          <CodeBlock>{`{
  "mcpServers": {
    "lens": {
      "command": "lens-daemon",
      "args": ["--stdio"]
    }
  }
}`}</CodeBlock>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Claude Code will spawn the daemon in MCP stdio mode and use it for
          context lookups automatically. No manual configuration needed.
        </p>
      </section>

      {/* CLI Reference */}
      <section>
        <h2 className="text-xl font-semibold">CLI Reference</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          All commands support{" "}
          <code className="rounded bg-card px-1.5 py-0.5 text-xs">--json</code>{" "}
          for machine-readable output.
        </p>
        <div className="mt-4 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted">
                <th className="px-4 py-3 text-left font-medium text-foreground">
                  Command
                </th>
                <th className="px-4 py-3 text-left font-medium text-foreground">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {cliCommands.map((cmd) => (
                <tr
                  key={cmd.command}
                  className="border-b border-border/50 last:border-0"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-success">
                    {cmd.command}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {cmd.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
