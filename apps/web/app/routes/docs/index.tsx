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
  { command: "lens init", description: "Initialize LENS config in current directory" },
  { command: "lens repo register <path>", description: "Register a repo for indexing" },
  { command: "lens repo list", description: "List registered repos" },
  { command: "lens repo remove <id>", description: "Remove a registered repo" },
  { command: "lens repo watch <id>", description: "Enable file watcher for a repo" },
  { command: "lens index", description: "Index the current repo (or all registered)" },
  { command: 'lens context "<goal>"', description: "Generate a context pack for a goal" },
  { command: "lens daemon start", description: "Start the HTTP daemon on :4111" },
  { command: "lens daemon stop", description: "Stop the running daemon" },
  { command: "lens daemon stats", description: "Show daemon status and uptime" },
  { command: "lens status", description: "Show repo index status" },
  { command: "lens config", description: "Show current config" },
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
          Initialize, register your repo, and query in seconds.
        </p>
        <div className="mt-4 space-y-3">
          <CodeBlock>{`$ lens init
Config written to ~/.lens/config.json

$ lens repo register .
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
          Start the HTTP daemon for persistent access on port 4111.
        </p>
        <div className="mt-4">
          <CodeBlock>{`$ lens daemon start
LENS daemon running on http://localhost:4111

$ curl http://localhost:4111/context \\
  -H "Content-Type: application/json" \\
  -d '{"goal": "add auth middleware"}'`}</CodeBlock>
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
          All available commands.
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
