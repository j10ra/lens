import { useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/docs/")({
  component: DocsIndex,
});

// --- Syntax highlighting ------------------------------------------------

type Token = { text: string; cls?: string };

const C = {
  prompt: "text-muted-foreground/60",
  cmd: "text-primary",
  flag: "text-success",
  str: "text-foreground",
  output: "text-muted-foreground",
  comment: "text-muted-foreground/50 italic",
  key: "text-primary",
  punct: "text-muted-foreground/50",
  num: "text-destructive",
} as const;

function highlightBash(src: string): Token[][] {
  return src.split("\n").map((line) => {
    if (line.startsWith("#")) return [{ text: line, cls: C.comment }];
    if (!line.startsWith("$")) return [{ text: line, cls: C.output }];

    const tokens: Token[] = [{ text: "$ ", cls: C.prompt }];
    const rest = line.slice(2);
    const parts = rest.split(/(\s+)/);
    let seenCmd = false;

    for (const part of parts) {
      if (/^\s+$/.test(part)) {
        tokens.push({ text: part });
      } else if (!seenCmd) {
        tokens.push({ text: part, cls: C.cmd });
        seenCmd = true;
      } else if (part.startsWith("-")) {
        tokens.push({ text: part, cls: C.flag });
      } else if (part.startsWith('"') || part.startsWith("'")) {
        tokens.push({ text: part, cls: C.str });
      } else if (part.startsWith("http")) {
        tokens.push({ text: part, cls: C.str });
      } else {
        tokens.push({ text: part });
      }
    }
    return tokens;
  });
}

function highlightJson(src: string): Token[][] {
  return src.split("\n").map((line) => {
    if (line.trimStart().startsWith("//"))
      return [{ text: line, cls: C.comment }];

    const tokens: Token[] = [];
    const re = /("(?:[^"\\]|\\.)*")\s*(:)?|([{}[\],])|(\d+(?:\.\d+)?)|(\s+)|([^"{}[\],:\s]+)/g;
    let m: RegExpExecArray | null;

    while ((m = re.exec(line)) !== null) {
      if (m[1]) {
        tokens.push({ text: m[1], cls: m[2] ? C.key : C.str });
        if (m[2]) tokens.push({ text: ":", cls: C.punct });
      } else if (m[3]) {
        tokens.push({ text: m[3], cls: C.punct });
      } else if (m[4]) {
        tokens.push({ text: m[4], cls: C.num });
      } else {
        tokens.push({ text: m[0] });
      }
    }
    return tokens;
  });
}

function renderTokens(lines: Token[][]): ReactNode {
  return lines.map((tokens, i) => {
    const isCommand = i > 0 && tokens[0]?.text === "$ ";
    const prevLine = i > 0 ? lines[i - 1] : undefined;
    const previousIsComment = Boolean(prevLine?.[0]?.text?.startsWith("#"));
    const lineSpacing = isCommand && !previousIsComment ? "mt-4" : undefined;

    return (
      <div key={i} className={lineSpacing}>
      {tokens.map((t, j) => (
        <span key={j} className={t.cls}>
          {t.text}
        </span>
      ))}
      </div>
    );
  });
}

function extractBashCommands(src: string): string {
  const commands: string[] = [];
  const lines = src.split("\n");
  let collectingContinuation = false;

  for (const line of lines) {
    if (line.startsWith("$ ")) {
      commands.push(line.slice(2));
      collectingContinuation = line.trimEnd().endsWith("\\");
      continue;
    }

    if (collectingContinuation && line.trim().length > 0 && commands.length > 0) {
      commands[commands.length - 1] += `\n${line.trimStart()}`;
      collectingContinuation = line.trimEnd().endsWith("\\");
    } else {
      collectingContinuation = false;
    }
  }

  return commands.join("\n\n");
}

function Code({
  lang,
  children,
}: { lang: "bash" | "json"; children: string }) {
  const [copied, setCopied] = useState(false);
  const lines =
    lang === "json" ? highlightJson(children) : highlightBash(children);
  const copyText = lang === "bash" ? extractBashCommands(children) : children;
  const copyLabel = lang === "bash" ? "Copy commands" : "Copy JSON";
  const preLineHeight = lang === "json" ? "leading-relaxed" : "leading-loose";

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border/70">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-1.5 sm:px-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {lang === "bash" ? "Terminal" : "JSON"}
        </span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-muted-foreground">
            {lang}
          </span>
          <button
            type="button"
            onClick={onCopy}
            className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
            aria-label={copyLabel}
          >
            {copied ? "Copied" : copyLabel}
          </button>
        </div>
      </div>
      <pre className={`overflow-x-auto px-3 py-3 font-mono text-sm text-foreground sm:px-4 sm:py-4 ${preLineHeight}`}>
        {renderTokens(lines)}
      </pre>
    </div>
  );
}

// --- Data ---------------------------------------------------------------

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
  { command: "lens repo mcp", description: "Write .mcp.json for agent integration" },
  { command: "lens index", description: "Index the current repo" },
  { command: 'lens context "<goal>"', description: "Build a context pack for a goal" },
  { command: "lens status", description: "Show repo index/embedding status" },
  { command: "lens dashboard", description: "Open local dashboard in browser" },
  { command: "lens login", description: "Authenticate via OAuth (GitHub/Google)" },
  { command: "lens logout", description: "Clear cloud authentication" },
  { command: "lens config get <key>", description: "Get a config value" },
  { command: "lens config set <key> <val>", description: "Set a config value" },
];

const pipelineSteps = [
  {
    name: "Diff Scan",
    detail:
      "Detects changed files since last index. Only re-processes what changed — full re-index on first run, incremental after.",
  },
  {
    name: "TF-IDF Scoring",
    detail:
      "Tokenizes file content, path segments, exports, and docstrings. Applies code-domain stopwords (import, export, const, etc.) so real signal isn't diluted.",
  },
  {
    name: "Concept Expansion",
    detail:
      'Static synonyms + repo-specific vocab clusters expand your query. "auth" matches verifyToken, sessionMiddleware, loginHandler — even if those words never appear in your prompt.',
  },
  {
    name: "Import Graph",
    detail:
      "Builds a directed graph of every import/require. Walks 2 hops from matched files to surface dependencies. Hub files (imported by many) get boosted.",
  },
  {
    name: "Git Co-Change",
    detail:
      "Analyzes commit history for files that change together. Catches cross-cutting concerns — like a test file that always moves with its source — that text search misses entirely.",
  },
  {
    name: "Semantic Boost",
    detail:
      "Pro only. Vector search finds files with zero keyword overlap. Meaning-level matching where TF-IDF falls short.",
    pro: true,
  },
  {
    name: "Cache",
    detail:
      "Results are cached with 120s TTL and 20-entry LRU. ~10ms for cached queries, under 1s cold.",
  },
];

const mcpTools = [
  {
    name: "get_context",
    description:
      "Ranked files, imports, and co-change clusters for a development goal",
  },
  { name: "list_repos", description: "All indexed repositories" },
  {
    name: "get_status",
    description: "Index and embedding status for a repo",
  },
  {
    name: "index_repo",
    description: "Trigger re-index (optionally force full rebuild)",
  },
];

function InlineCode({
  children,
  className = "",
}: { children: ReactNode; className?: string }) {
  return (
    <code
      className={`rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-foreground ${className}`}
    >
      {children}
    </code>
  );
}

// --- Page ---------------------------------------------------------------

function DocsIndex() {
  return (
    <div className="space-y-12 pb-8">
      <section
        id="overview"
        className="scroll-mt-28 border-b border-border/70 pb-8"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Documentation
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Getting Started
        </h1>
        <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">
          LENS indexes your codebase locally and serves context packs to AI
          agents. No API keys required for local-only usage.
        </p>
      </section>

      <section
        id="install"
        className="scroll-mt-28 border-b border-border/70 pb-10"
      >
        <h2 className="text-xl font-semibold tracking-tight">Install</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Requires Node.js 20+.
        </p>
        <div className="mt-5">
          <Code lang="bash">$ npm install -g lens-engine</Code>
        </div>
      </section>

      <section
        id="quick-start"
        className="scroll-mt-28 border-b border-border/70 pb-10"
      >
        <h2 className="text-xl font-semibold tracking-tight">Quick Start</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Three commands.{" "}
          <InlineCode>lens repo register</InlineCode>{" "}
          handles everything — indexes files via TF-IDF, builds the import
          graph, analyzes git history, writes{" "}
          <InlineCode>.mcp.json</InlineCode>, and injects{" "}
          <InlineCode>CLAUDE.md</InlineCode> instructions. One pass.
        </p>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Example Session
        </p>
        <div className="mt-5">
          <Code lang="bash">{`$ lens daemon start
LENS daemon running on http://localhost:4111

$ lens repo register
Registered: my-project
Scanning files... 847 files
Building import graph... done
Analyzing git history... done
Index complete in 2.3s

$ lens context "add auth middleware"
Context pack: 12 files, 3.2KB
  src/middleware/auth.ts
  src/routes/login.ts
  src/lib/tokens.ts
  ...`}</Code>
        </div>
      </section>

      <section
        id="what-it-does"
        className="scroll-mt-28 border-b border-border/70 pb-10"
      >
        <h2 className="text-xl font-semibold tracking-tight">What It Does</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Every context query runs through a 7-stage pipeline. Your code never
          leaves your machine.
        </p>
        <ol className="mt-6 space-y-5">
          {pipelineSteps.map((step, i) => (
            <li key={step.name} className="pl-1">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <h3 className="text-sm font-semibold text-foreground">
                  {step.name}
                  {step.pro && (
                    <span className="ml-2 text-[10px] font-medium uppercase tracking-[0.1em] text-primary">
                      Pro
                    </span>
                  )}
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {step.detail}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section
        id="mcp-integration"
        className="scroll-mt-28 border-b border-border/70 pb-10"
      >
        <h2 className="text-xl font-semibold tracking-tight">MCP Integration</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          <InlineCode>lens repo register</InlineCode> writes{" "}
          <InlineCode>.mcp.json</InlineCode>{" "}
          automatically during registration. It also injects a{" "}
          <InlineCode>CLAUDE.md</InlineCode> section telling the agent when
          context lookups are useful.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          No friction. Agents decide when to use LENS based on the task — you
          never invoke it manually. Claude Code reads{" "}
          <InlineCode>.mcp.json</InlineCode> on startup and calls{" "}
          <InlineCode>get_context</InlineCode>{" "}
          autonomously.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          If <InlineCode>.mcp.json</InlineCode> is missing later, run{" "}
          <InlineCode>lens repo mcp</InlineCode>{" "}
          to re-create it.
        </p>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Example File
        </p>
        <div className="mt-5">
          <Code lang="json">{`// .mcp.json (auto-created by lens repo register)
{
  "mcpServers": {
    "lens": {
      "command": "npx",
      "args": ["lens-daemon", "--stdio"]
    }
  }
}`}</Code>
        </div>

        <h3 className="mt-7 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Exposed MCP Tools
        </h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border/70">
                <th className="px-4 py-2.5 text-left font-medium text-foreground">
                  Tool
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-foreground">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {mcpTools.map((tool) => (
                <tr
                  key={tool.name}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-success">
                    {tool.name}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {tool.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        id="daemon-mode"
        className="scroll-mt-28 border-b border-border/70 pb-10"
      >
        <h2 className="text-xl font-semibold tracking-tight">Daemon Mode</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The daemon runs on port 4111 and serves the REST API, MCP stdio, and
          local dashboard.
        </p>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Example Session
        </p>
        <div className="mt-5">
          <Code lang="bash">{`$ lens daemon start
LENS daemon running on http://localhost:4111

$ lens dashboard
Opening http://localhost:4111/dashboard/

$ curl http://localhost:4111/context \\
  -H "Content-Type: application/json" \\
  -d '{"goal": "add auth middleware"}'`}</Code>
        </div>
      </section>

      <section
        id="pro"
        className="scroll-mt-28 border-b border-border/70 pb-10"
      >
        <h2 className="text-xl font-semibold tracking-tight">Pro</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          LENS is free for local use — TF-IDF, import graph, co-change, and
          caching all work without an account. Pro unlocks two additional
          pipeline stages that improve retrieval accuracy for larger or more
          complex codebases.
        </p>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-primary">
                S
              </span>
              <h3 className="font-semibold text-foreground">Semantic Embeddings</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Every file chunk is embedded for semantic search. When you query,
              LENS runs cosine similarity against all vectors to
              find files that are semantically relevant — even when they share
              zero keywords with your prompt.
            </p>
            <div className="mt-4 space-y-2 text-xs leading-relaxed text-muted-foreground/75">
              <p className="font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                Example
              </p>
              <p>
                Query:{" "}
                <InlineCode className="px-1 py-0 text-xs">
                  "handle expired sessions"
                </InlineCode>
              </p>
              <p>
                Surfaces{" "}
                <InlineCode className="px-1 py-0 text-xs">
                  tokenRefresh.ts
                </InlineCode>{" "}
                and{" "}
                <InlineCode className="px-1 py-0 text-xs">
                  authMiddleware.ts
                </InlineCode>
                .
              </p>
              <p>Neither contains the word "session".</p>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-primary">
                V
              </span>
              <h3 className="font-semibold text-foreground">Vocab Clusters</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Export names across your repo are embedded and clustered by cosine
              similarity (threshold {">"}0.75). When a query matches one term
              in a cluster, all related terms are pulled in — automatic query
              expansion tuned to your codebase.
            </p>
            <div className="mt-4 space-y-2 text-xs leading-relaxed text-muted-foreground/75">
              <p className="font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                Example
              </p>
              <p>
                Query:{" "}
                <InlineCode className="px-1 py-0 text-xs">"auth"</InlineCode>
              </p>
              <p>
                Expands to{" "}
                <InlineCode className="px-1 py-0 text-xs">verifyToken</InlineCode>,{" "}
                <InlineCode className="px-1 py-0 text-xs">
                  sessionMiddleware
                </InlineCode>
                , <InlineCode className="px-1 py-0 text-xs">loginHandler</InlineCode>,{" "}
                <InlineCode className="px-1 py-0 text-xs">requireAuth</InlineCode>
                .
              </p>
            </div>
          </div>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          Together they add ~100-300ms per query. After logging in, you can
          either run <InlineCode>lens index --force</InlineCode>{" "}
          to embed everything immediately, or leave it — LENS embeds new and
          changed files on each incremental index, so coverage grows
          automatically as you work.
        </p>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Example Session
        </p>

        <div className="mt-5">
          <Code lang="bash">{`$ lens login --github
Authenticated as user@example.com

$ lens status
Pro: active
Embeddings: 847/847 files
Vocab clusters: 42 clusters

# Optional: force full re-index to embed everything now
$ lens index --force`}</Code>
        </div>
      </section>

      <section
        id="cli-reference"
        className="scroll-mt-28 pb-4"
      >
        <h2 className="text-xl font-semibold tracking-tight">CLI Reference</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          All commands support <InlineCode>--json</InlineCode>{" "}
          for machine-readable output.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[660px] text-sm">
            <thead>
              <tr className="border-b border-border/70">
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
                  className="border-b border-border/60 last:border-0"
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
