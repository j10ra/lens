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
  { command: "lens daemon start -f", description: "Start daemon in foreground (no detach)" },
  { command: "lens daemon stop", description: "Stop the running daemon" },
  { command: "lens status", description: "Show daemon version, status, uptime" },
  { command: "lens register <path>", description: "Register a repo and trigger full index" },
  { command: "lens list", description: "List all registered repos with index status" },
  { command: "lens remove <id>", description: "Remove a registered repo by UUID" },
  { command: 'lens grep "<query>"', description: "Ranked search with pipe-separated terms" },
  { command: "lens graph", description: "Cluster-level dependency graph overview" },
  { command: "lens graph <dir>", description: "Directory-level file graph with co-changes" },
  { command: "lens graph --file <path>", description: "Single file neighborhood: imports, importers, co-changes" },
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
      'Static synonyms + repo-specific vocab expand your query. "auth" matches verifyToken, sessionMiddleware, loginHandler — even if those words never appear in your prompt.',
  },
  {
    name: "Import Graph",
    detail:
      "Builds a directed graph of every import/require. Hub files (imported by many) get boosted. Surfaces dependencies that text search misses.",
  },
  {
    name: "Git Co-Change",
    detail:
      "Analyzes commit history for files that change together. Catches cross-cutting concerns — like a test file that always moves with its source — that text search misses entirely.",
  },
  {
    name: "Cache",
    detail:
      "Auto-reindex on git HEAD change. Under 1s cold queries, near-instant for unchanged repos.",
  },
];

const mcpTools = [
  {
    name: "lens_grep",
    description:
      "Ranked code search — pipe-separated terms, per-file relevance score, symbols, importers, co-change partners",
  },
  {
    name: "lens_graph",
    description:
      "Dependency map — cluster-level overview or directory-level drill-down with import edges and hub files",
  },
  {
    name: "lens_graph_neighbors",
    description:
      "File neighborhood — all exports, imports, importers, and co-change partners for a single file",
  },
  {
    name: "lens_reindex",
    description:
      "Trigger a reindex of a registered repo — rebuilds file metadata, import graph, and git analysis",
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
          LENS is an open-source code intelligence engine. It indexes your
          codebase locally and serves structural context to AI agents via MCP
          or CLI. No API keys, no cloud, fully deterministic.
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
          <InlineCode>lens register</InlineCode>{" "}
          handles everything — indexes files via TF-IDF, builds the import
          graph, and analyzes git history. One pass.
        </p>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Example Session
        </p>
        <div className="mt-5">
          <Code lang="bash">{`$ lens daemon start
LENS daemon running on http://localhost:4111

$ lens register .
Registered: my-project
Scanning files... 847 files
Building import graph... done
Analyzing git history... done
Index complete in 2.3s

$ lens grep "auth|middleware|session"
[auth] 8 results
  src/middleware/auth.ts  [hub]  0.94
    importers: routes/login.ts, routes/api.ts
  src/lib/tokens.ts             0.87
    importers: middleware/auth.ts`}</Code>
        </div>
      </section>

      <section
        id="what-it-does"
        className="scroll-mt-28 border-b border-border/70 pb-10"
      >
        <h2 className="text-xl font-semibold tracking-tight">What It Does</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Every search query runs through a multi-stage pipeline. Your code
          never leaves your machine.
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
        id="benchmarks"
        className="scroll-mt-28 border-b border-border/70 pb-10"
      >
        <h2 className="text-xl font-semibold tracking-tight">
          Benchmarks &amp; Findings
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          We ran controlled A/B benchmarks across multiple repos (32-2000+
          files) to measure what LENS actually does for AI agents. Here's what
          we found — the good and the honest.
        </p>

        <h3 className="mt-7 text-sm font-semibold text-foreground">
          What works
        </h3>
        <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-success">+</span>
            <span>
              <strong className="text-foreground">
                +15.8pp on unfamiliar repos
              </strong>{" "}
              — when agents explore a codebase they've never seen, pre-injected
              LENS context improved answer accuracy by 15.8 percentage points
              vs baseline.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-success">+</span>
            <span>
              <strong className="text-foreground">Sub-second queries</strong> —
              ranked results return under 1s cold. The pipeline (TF-IDF, import
              graph, co-change, concept expansion) runs entirely local.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-success">+</span>
            <span>
              <strong className="text-foreground">
                Co-change catches what grep misses
              </strong>{" "}
              — git history analysis surfaces files that always change together
              (e.g. a service + its test + its migration). No keyword overlap
              needed.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-success">+</span>
            <span>
              <strong className="text-foreground">Import graph traversal</strong>{" "}
              — dependency walking finds structural relationships that flat
              file search can't.
            </span>
          </li>
        </ul>

        <h3 className="mt-7 text-sm font-semibold text-foreground">
          What we learned
        </h3>
        <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-muted-foreground/60">~</span>
            <span>
              <strong className="text-foreground">
                Agents are good at grep
              </strong>{" "}
              — on tasks with obvious search keywords, agents score equally
              well with or without LENS. Grep + Glob is already effective
              for keyword-rich tasks.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-muted-foreground/60">~</span>
            <span>
              <strong className="text-foreground">
                MCP tool adoption is hard
              </strong>{" "}
              — agents tend to default to built-in tools (Grep, Glob, Read)
              regardless of tool descriptions. LENS MCP tools work best when
              explicitly referenced in CLAUDE.md instructions.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-muted-foreground/60">~</span>
            <span>
              <strong className="text-foreground">
                Value scales with unfamiliarity
              </strong>{" "}
              — LENS helps most when the agent (or developer) doesn't know
              where to start. On repos you work in daily, you already know the
              right files. On new codebases, LENS's structural ranking provides
              real signal.
            </span>
          </li>
        </ul>

        <div className="mt-7 rounded-lg border border-border/70 bg-muted/30 px-4 py-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Full benchmark data, raw outputs, and scoring methodology are
            published in the{" "}
            <a
              href="https://github.com/j10ra/lens/tree/main/bench"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              bench/
            </a>{" "}
            directory on GitHub.
          </p>
        </div>
      </section>

      <section
        id="mcp-integration"
        className="scroll-mt-28 border-b border-border/70 pb-10"
      >
        <h2 className="text-xl font-semibold tracking-tight">MCP Integration</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          LENS exposes 4 MCP tools via HTTP Streamable transport. Add a single
          entry to your project's{" "}
          <InlineCode>.mcp.json</InlineCode>{" "}
          and the daemon handles the rest. The daemon must be running (
          <InlineCode>lens daemon start</InlineCode>).
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Claude Code, Cursor, and any MCP-compatible agent reads{" "}
          <InlineCode>.mcp.json</InlineCode> on startup and calls
          LENS tools autonomously.
        </p>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          .mcp.json
        </p>
        <div className="mt-5">
          <Code lang="json">{`{
  "mcpServers": {
    "lens": {
      "type": "http",
      "url": "http://localhost:4111/mcp"
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
          The daemon runs on port 4111 and serves the REST API, MCP endpoint,
          and local dashboard. Data is stored at{" "}
          <InlineCode>~/.lens/</InlineCode> (SQLite for index + traces).
        </p>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Example Session
        </p>
        <div className="mt-5">
          <Code lang="bash">{`$ lens daemon start
LENS daemon running on http://localhost:4111

$ lens status
LENS v2.0.0 — running
Uptime: 3h 42m
URL: http://localhost:4111

# Dashboard is served at the daemon URL
# Open http://localhost:4111 in your browser`}</Code>
        </div>
      </section>

      <section
        id="cli-reference"
        className="scroll-mt-28 pb-4"
      >
        <h2 className="text-xl font-semibold tracking-tight">CLI Reference</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The <InlineCode>lens</InlineCode>{" "}
          CLI calls the daemon HTTP API. All commands require the daemon to be
          running.
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
