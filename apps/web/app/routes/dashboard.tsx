import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/PublicLayout";
import { Terminal, Database, Globe, Layers, Search, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

/* ------------------------------------------------------------------ */
/*  Screenshot frame                                                   */
/* ------------------------------------------------------------------ */

function ScreenshotFrame({ title, caption, children, scene }: {
  title: string;
  caption: string;
  children: ReactNode;
  scene?: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {caption}
      </p>
      <div className={`relative overflow-hidden rounded-2xl border border-border/70 ${scene ? "bg-background" : "bg-card/70"}`}>
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="size-[9px] rounded-full bg-foreground/12" />
            <span className="size-[9px] rounded-full bg-foreground/12" />
            <span className="size-[9px] rounded-full bg-foreground/12" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {title}
          </span>
        </div>
        <div className="pointer-events-none select-none">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mock primitives                                                    */
/* ------------------------------------------------------------------ */

function Badge({ children, variant = "success" }: { children: ReactNode; variant?: "success" | "warning" | "muted" | "amber" | "primary" }) {
  const colors = {
    success: "bg-success/12 text-success border-success/30",
    warning: "bg-amber-500/12 text-amber-600 dark:text-amber-400 border-amber-500/30",
    muted: "bg-muted/50 text-muted-foreground border-border/80",
    amber: "bg-amber-500/12 text-amber-500 border-amber-500/30",
    primary: "bg-primary/12 text-primary border-primary/30",
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${colors[variant]}`}>
      {children}
    </span>
  );
}

function StatCard({ label, value, desc }: { label: string; value: string; desc?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/65 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const stats = [
  { label: "Repos", value: "4", desc: "registered" },
  { label: "Files", value: "12,847", desc: "across all repos" },
  { label: "Import Edges", value: "8,431", desc: "dependency links" },
  { label: "DB Size", value: "28 MB" },
  { label: "Uptime", value: "3h 42m" },
];

const overviewRepos = [
  { name: "lens", path: "~/dev/lens", files: 142, edges: 891, hubs: 12 },
  { name: "webapp", path: "~/dev/webapp", files: 87, edges: 534, hubs: 8 },
];

/* ------------------------------------------------------------------ */
/*  Galaxy 3D mock — SVG recreation of the scene                       */
/* ------------------------------------------------------------------ */

type GalaxyNode = {
  x: number; y: number;
  r: number;
  color: string;
  label?: string;
  hub?: boolean;
  selected?: boolean;
  dimmed?: boolean;
};

type GalaxyEdge = {
  x1: number; y1: number;
  x2: number; y2: number;
  color: string;
  opacity: number;
  width: number;
  dashed?: boolean;
};

const LANG_COLORS = {
  ts: "#3178c6",
  tsx: "#3178c6",
  js: "#f7df1e",
  css: "#9333ea",
  json: "#64748b",
  md: "#6b7280",
};

// Cluster positions — mimics Fibonacci sphere distribution
const galaxyNodes: GalaxyNode[] = [
  // packages/engine cluster (top-left)
  { x: 145, y: 110, r: 5.5, color: LANG_COLORS.ts, label: "scorer.ts", hub: true },
  { x: 125, y: 125, r: 4.2, color: LANG_COLORS.ts, label: "import-graph.ts", hub: true },
  { x: 160, y: 130, r: 3.8, color: LANG_COLORS.ts },
  { x: 138, y: 98, r: 3.2, color: LANG_COLORS.ts },
  { x: 155, y: 105, r: 2.8, color: LANG_COLORS.ts },
  { x: 130, y: 140, r: 2.5, color: LANG_COLORS.ts },
  { x: 170, y: 118, r: 2.2, color: LANG_COLORS.ts },
  { x: 148, y: 142, r: 2.0, color: LANG_COLORS.ts },
  { x: 118, y: 112, r: 2.0, color: LANG_COLORS.ts },

  // packages/core cluster (center-right)
  { x: 320, y: 145, r: 5.0, color: LANG_COLORS.ts, label: "trace-store.ts", hub: true },
  { x: 340, y: 130, r: 4.0, color: LANG_COLORS.ts, label: "lens-fn.ts" },
  { x: 305, y: 158, r: 3.5, color: LANG_COLORS.ts },
  { x: 335, y: 160, r: 2.8, color: LANG_COLORS.ts },
  { x: 350, y: 148, r: 2.2, color: LANG_COLORS.ts },
  { x: 310, y: 135, r: 2.0, color: LANG_COLORS.ts },

  // apps/daemon cluster (bottom-center)
  { x: 230, y: 230, r: 4.8, color: LANG_COLORS.ts, label: "mcp.ts", hub: true },
  { x: 250, y: 215, r: 3.8, color: LANG_COLORS.ts, label: "http.ts" },
  { x: 215, y: 245, r: 3.0, color: LANG_COLORS.ts },
  { x: 260, y: 240, r: 2.5, color: LANG_COLORS.ts },
  { x: 238, y: 255, r: 2.0, color: LANG_COLORS.ts },
  { x: 205, y: 225, r: 2.2, color: LANG_COLORS.ts },

  // apps/dashboard cluster (top-right)
  { x: 390, y: 85, r: 4.0, color: LANG_COLORS.tsx, label: "Explore.tsx" },
  { x: 375, y: 70, r: 3.5, color: LANG_COLORS.tsx },
  { x: 405, y: 95, r: 3.0, color: LANG_COLORS.tsx },
  { x: 410, y: 75, r: 2.8, color: LANG_COLORS.css },
  { x: 380, y: 100, r: 2.2, color: LANG_COLORS.tsx },
  { x: 395, y: 65, r: 2.0, color: LANG_COLORS.tsx },

  // Scattered small nodes
  { x: 200, y: 170, r: 1.8, color: LANG_COLORS.json, dimmed: true },
  { x: 280, y: 90, r: 1.8, color: LANG_COLORS.md, dimmed: true },
  { x: 180, y: 200, r: 1.5, color: LANG_COLORS.ts, dimmed: true },
  { x: 300, y: 200, r: 1.5, color: LANG_COLORS.ts, dimmed: true },
  { x: 360, y: 190, r: 1.5, color: LANG_COLORS.json, dimmed: true },

  // Selected node
  { x: 230, y: 155, r: 6, color: "#ffffff", label: "index.ts", selected: true },
];

const galaxyEdges: GalaxyEdge[] = [
  // Import edges from selected node (index.ts) — blue = imports, green = importers
  { x1: 230, y1: 155, x2: 145, y2: 110, color: "#3b82f6", opacity: 0.6, width: 1.2 },
  { x1: 230, y1: 155, x2: 125, y2: 125, color: "#3b82f6", opacity: 0.6, width: 1.2 },
  { x1: 230, y1: 155, x2: 320, y2: 145, color: "#3b82f6", opacity: 0.5, width: 1 },
  { x1: 230, y1: 230, x2: 230, y2: 155, color: "#22c55e", opacity: 0.6, width: 1.2 },
  { x1: 250, y1: 215, x2: 230, y2: 155, color: "#22c55e", opacity: 0.5, width: 1 },
  { x1: 390, y1: 85, x2: 230, y2: 155, color: "#22c55e", opacity: 0.4, width: 0.8 },
  // Co-change edges — amber dashed
  { x1: 230, y1: 155, x2: 340, y2: 130, color: "#f59e0b", opacity: 0.5, width: 1, dashed: true },
  { x1: 230, y1: 155, x2: 160, y2: 130, color: "#f59e0b", opacity: 0.4, width: 0.8, dashed: true },
  // Background edges (dim)
  { x1: 145, y1: 110, x2: 125, y2: 125, color: "var(--color-border)", opacity: 0.12, width: 0.5 },
  { x1: 320, y1: 145, x2: 340, y2: 130, color: "var(--color-border)", opacity: 0.12, width: 0.5 },
  { x1: 305, y1: 158, x2: 335, y2: 160, color: "var(--color-border)", opacity: 0.12, width: 0.5 },
  { x1: 375, y1: 70, x2: 405, y2: 95, color: "var(--color-border)", opacity: 0.12, width: 0.5 },
  { x1: 230, y1: 230, x2: 260, y2: 240, color: "var(--color-border)", opacity: 0.12, width: 0.5 },
  { x1: 215, y1: 245, x2: 238, y2: 255, color: "var(--color-border)", opacity: 0.12, width: 0.5 },
];

// Stars for backdrop
const stars = Array.from({ length: 80 }, (_, i) => ({
  x: (i * 7919 + 3571) % 480,
  y: (i * 6271 + 1423) % 300,
  r: 0.3 + (i % 3) * 0.15,
  opacity: 0.15 + (i % 5) * 0.08,
}));

function GalaxyPreview() {
  return (
    <ScreenshotFrame title="Graph · Galaxy" caption="3D force-directed graph — navigate your codebase in space" scene>
      <div className="relative" style={{ height: 360 }}>
        {/* Backdrop — adapts to theme */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--color-card)_0%,_var(--color-background)_70%)]" />

        {/* Dot grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(circle, var(--color-muted-foreground) 0.5px, transparent 0.5px)",
            backgroundSize: "14px 14px",
          }}
        />

        {/* SVG scene */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 480 300" preserveAspectRatio="xMidYMid meet">
          {/* Stars */}
          {stars.map((s, i) => (
            <circle key={`s${i}`} cx={s.x} cy={s.y} r={s.r} fill="var(--color-muted-foreground)" opacity={s.opacity} />
          ))}

          {/* Edges */}
          {galaxyEdges.map((e, i) => (
            <line
              key={`e${i}`}
              x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
              stroke={e.color}
              strokeWidth={e.width}
              opacity={e.opacity}
              strokeDasharray={e.dashed ? "4 2" : undefined}
            />
          ))}

          {/* Nodes */}
          {galaxyNodes.map((n, i) => (
            <g key={`n${i}`}>
              {n.hub && !n.dimmed && (
                <circle cx={n.x} cy={n.y} r={n.r + 3} fill={n.color} opacity={0.15} />
              )}
              {n.selected && (
                <>
                  <circle cx={n.x} cy={n.y} r={n.r + 5} fill="none" stroke="var(--color-foreground)" strokeWidth={0.5} opacity={0.2} />
                  <circle cx={n.x} cy={n.y} r={n.r + 2} fill="none" stroke="var(--color-foreground)" strokeWidth={0.8} opacity={0.4} />
                </>
              )}
              <circle
                cx={n.x} cy={n.y} r={n.r}
                fill={n.selected ? "var(--color-foreground)" : n.color}
                opacity={n.dimmed ? 0.2 : n.selected ? 1 : 0.85}
              />
              {n.label && (
                <text
                  x={n.x} y={n.y - n.r - 3}
                  textAnchor="middle"
                  fill={n.selected ? "var(--color-foreground)" : "var(--color-muted-foreground)"}
                  fontSize={n.selected ? 9 : 7}
                  fontFamily="JetBrains Mono, monospace"
                  opacity={n.dimmed ? 0.3 : 0.9}
                >
                  {n.label}
                </text>
              )}
            </g>
          ))}
        </svg>

        {/* Vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_40%,_var(--color-background)_90%)]" />

        {/* Search bar overlay */}
        <div className="absolute left-3 top-3 flex h-8 w-56 items-center gap-2 rounded-xl border border-border/50 bg-background/80 px-3 backdrop-blur-sm">
          <Search className="size-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground/60">Search files, symbols...</span>
        </div>

        {/* View toggle overlay */}
        <div className="absolute bottom-3 left-3 flex overflow-hidden rounded-md border border-border/50 bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-1 bg-accent px-2.5 py-1.5">
            <Globe className="size-3 text-accent-foreground" />
            <span className="text-[10px] font-medium text-accent-foreground">Galaxy</span>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1.5">
            <Layers className="size-3 text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground">DAG</span>
          </div>
        </div>

        {/* Stats badge */}
        <div className="absolute bottom-3 left-[140px] flex gap-2">
          <span className="rounded bg-background/80 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground backdrop-blur-sm">142 files</span>
          <span className="rounded bg-background/80 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground backdrop-blur-sm">891 edges</span>
        </div>

        {/* Right side info panel */}
        <div className="absolute right-3 top-3 bottom-3 w-48 overflow-hidden rounded-lg border border-border/50 bg-background/95 backdrop-blur-sm">
          <div className="border-b border-border p-3">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-[#3178c6]" />
              <span className="text-[11px] font-semibold text-foreground">index.ts</span>
            </div>
            <p className="mt-1 font-mono text-[8px] text-muted-foreground">packages/engine/src/index.ts</p>
            <div className="mt-2 flex items-center gap-1">
              <ExternalLink className="size-2.5 text-muted-foreground" />
              <span className="text-[8px] text-muted-foreground">Open in editor</span>
            </div>
          </div>
          <div className="border-b border-border p-3">
            <div className="flex gap-1">
              <span className="rounded bg-[#3178c6]/20 px-1.5 py-0.5 text-[8px] font-medium text-[#3178c6]">TypeScript</span>
              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-medium text-amber-500 dark:text-amber-400">hub</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[8px] font-mono text-muted-foreground">0.94</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {[["commits", "47"], ["90d", "12"], ["conn.", "18"]].map(([l, v]) => (
                <div key={l} className="rounded border border-border px-1 py-1 text-center">
                  <p className="text-[7px] text-muted-foreground">{l}</p>
                  <p className="font-mono text-[9px] font-medium text-foreground">{v}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="p-3">
            <p className="text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">Imported by</p>
            <div className="mt-1.5 space-y-1">
              {["mcp.ts", "http.ts", "Explore.tsx"].map((f) => (
                <div key={f} className="flex items-center gap-1.5">
                  <span className="text-[9px] text-success">&darr;</span>
                  <span className="font-mono text-[9px] text-muted-foreground">{f}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">Imports</p>
            <div className="mt-1.5 space-y-1">
              {["scorer.ts", "import-graph.ts", "trace-store.ts"].map((f) => (
                <div key={f} className="flex items-center gap-1.5">
                  <span className="text-[9px] text-primary">&uarr;</span>
                  <span className="font-mono text-[9px] text-muted-foreground">{f}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">Co-changed</p>
            <div className="mt-1.5 space-y-1">
              {[["lens-fn.ts", "12"], ["extract.ts", "8"]].map(([f, w]) => (
                <div key={f} className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  <span className="font-mono text-[9px] text-muted-foreground">{f}</span>
                  <span className="font-mono text-[8px] text-muted-foreground/60">&times;{w}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Legend */}
          <div className="absolute bottom-0 inset-x-0 border-t border-border px-3 py-2 bg-background">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="inline-block h-px w-3 bg-success" /><span className="text-[7px] text-muted-foreground">import</span></span>
              <span className="flex items-center gap-1"><span className="inline-block h-px w-3 bg-primary" /><span className="text-[7px] text-muted-foreground">export</span></span>
              <span className="flex items-center gap-1"><span className="inline-block h-px w-3 border-t border-dashed border-amber-500" /><span className="text-[7px] text-muted-foreground">co-change</span></span>
            </div>
          </div>
        </div>
      </div>
    </ScreenshotFrame>
  );
}

/* ------------------------------------------------------------------ */
/*  DAG view mock — SVG layered graph                                  */
/* ------------------------------------------------------------------ */

type DagNode = {
  x: number; y: number;
  r: number;
  color: string;
  label: string;
  hub?: boolean;
  selected?: boolean;
  dimmed?: boolean;
};

type DagEdge = {
  sx: number; sy: number;
  tx: number; ty: number;
  color: string;
  opacity: number;
  width: number;
  dashed?: boolean;
};

const dagLayers = [
  { y: 30, label: "Entry Points", count: "3 / 3" },
  { y: 100, label: "Layer 1", count: "8 / 12" },
  { y: 170, label: "Layer 2", count: "6 / 9" },
  { y: 240, label: "Leaves", count: "5 / 5" },
];

const dagNodes: DagNode[] = [
  // Entry points (y=30)
  { x: 160, y: 30, r: 5, color: LANG_COLORS.ts, label: "daemon/index.ts", hub: true },
  { x: 280, y: 30, r: 4, color: LANG_COLORS.ts, label: "cli/index.ts" },
  { x: 400, y: 30, r: 4.5, color: LANG_COLORS.tsx, label: "App.tsx" },
  // Layer 1 (y=100) — selected node here
  { x: 100, y: 100, r: 5, color: LANG_COLORS.ts, label: "http.ts", hub: true },
  { x: 190, y: 100, r: 5.5, color: "#ffffff", label: "mcp.ts", selected: true },
  { x: 280, y: 100, r: 4, color: LANG_COLORS.ts, label: "routes/grep.ts" },
  { x: 370, y: 100, r: 3.5, color: LANG_COLORS.tsx, label: "Explore.tsx" },
  { x: 450, y: 100, r: 3, color: LANG_COLORS.tsx, label: "Navigator.tsx" },
  // Layer 2 (y=170)
  { x: 120, y: 170, r: 5, color: LANG_COLORS.ts, label: "engine/index.ts", hub: true },
  { x: 230, y: 170, r: 4.5, color: LANG_COLORS.ts, label: "scorer.ts", hub: true },
  { x: 330, y: 170, r: 4, color: LANG_COLORS.ts, label: "import-graph.ts" },
  { x: 420, y: 170, r: 3, color: LANG_COLORS.ts, label: "co-change.ts" },
  // Leaves (y=240)
  { x: 100, y: 240, r: 3.5, color: LANG_COLORS.ts, label: "trace-store.ts" },
  { x: 200, y: 240, r: 3, color: LANG_COLORS.ts, label: "schema.ts" },
  { x: 290, y: 240, r: 3, color: LANG_COLORS.ts, label: "logger.ts" },
  { x: 370, y: 240, r: 2.5, color: LANG_COLORS.ts, label: "lens-fn.ts" },
  { x: 450, y: 240, r: 2.5, color: LANG_COLORS.ts, label: "context.ts", dimmed: true },
];

function dagBezier(sx: number, sy: number, tx: number, ty: number): string {
  const cy1 = sy + (ty - sy) * 0.45;
  const cy2 = sy + (ty - sy) * 0.55;
  return `M${sx},${sy} C${sx},${cy1} ${tx},${cy2} ${tx},${ty}`;
}

const dagEdges: DagEdge[] = [
  // From entry points to layer 1
  { sx: 160, sy: 30, tx: 100, ty: 100, color: "var(--color-border)", opacity: 0.15, width: 0.5 },
  { sx: 160, sy: 30, tx: 190, ty: 100, color: "#22c55e", opacity: 0.7, width: 1.5 }, // → selected
  { sx: 280, sy: 30, tx: 280, ty: 100, color: "var(--color-border)", opacity: 0.15, width: 0.5 },
  { sx: 400, sy: 30, tx: 370, ty: 100, color: "var(--color-border)", opacity: 0.15, width: 0.5 },
  { sx: 400, sy: 30, tx: 450, ty: 100, color: "var(--color-border)", opacity: 0.15, width: 0.5 },
  // From selected (mcp.ts) to layer 2 — blue imports
  { sx: 190, sy: 100, tx: 120, ty: 170, color: "#3b82f6", opacity: 0.7, width: 1.5 },
  { sx: 190, sy: 100, tx: 230, ty: 170, color: "#3b82f6", opacity: 0.7, width: 1.5 },
  // Other edges layer 1 → 2
  { sx: 100, sy: 100, tx: 120, ty: 170, color: "var(--color-border)", opacity: 0.15, width: 0.5 },
  { sx: 280, sy: 100, tx: 230, ty: 170, color: "var(--color-border)", opacity: 0.15, width: 0.5 },
  { sx: 280, sy: 100, tx: 330, ty: 170, color: "var(--color-border)", opacity: 0.15, width: 0.5 },
  { sx: 370, sy: 100, tx: 330, ty: 170, color: "var(--color-border)", opacity: 0.15, width: 0.5 },
  // Layer 2 → leaves
  { sx: 120, sy: 170, tx: 100, ty: 240, color: "var(--color-border)", opacity: 0.15, width: 0.5 },
  { sx: 120, sy: 170, tx: 200, ty: 240, color: "var(--color-border)", opacity: 0.15, width: 0.5 },
  { sx: 230, sy: 170, tx: 290, ty: 240, color: "var(--color-border)", opacity: 0.15, width: 0.5 },
  { sx: 330, sy: 170, tx: 370, ty: 240, color: "var(--color-border)", opacity: 0.15, width: 0.5 },
  { sx: 420, sy: 170, tx: 450, ty: 240, color: "var(--color-border)", opacity: 0.15, width: 0.5 },
  // Co-change edge — amber dashed
  { sx: 190, sy: 100, tx: 420, ty: 170, color: "#f59e0b", opacity: 0.5, width: 1, dashed: true },
];

function DagPreview() {
  return (
    <ScreenshotFrame title="Graph · DAG" caption="Layered dependency graph — topological import hierarchy" scene>
      <div className="relative" style={{ height: 320 }}>
        <div className="absolute inset-0 bg-background" />

        <svg className="absolute inset-0 h-full w-full" viewBox="30 0 500 280" preserveAspectRatio="xMidYMid meet">
          {/* Layer bands */}
          {dagLayers.map((layer, i) => (
            <g key={`layer${i}`}>
              {i % 2 === 0 && (
                <rect x={30} y={layer.y - 18} width={500} height={50} fill="var(--color-foreground)" opacity={0.03} rx={4} />
              )}
              <text x={42} y={layer.y - 6} fill="var(--color-muted-foreground)" fontSize={7} fontFamily="Inter, sans-serif" fontWeight={600}>
                {layer.label}
              </text>
              <text x={42} y={layer.y + 2} fill="var(--color-muted-foreground)" fontSize={5.5} fontFamily="JetBrains Mono, monospace" opacity={0.6}>
                {layer.count}
              </text>
            </g>
          ))}

          {/* Edges — bezier curves */}
          {dagEdges.map((e, i) => (
            <path
              key={`de${i}`}
              d={dagBezier(e.sx, e.sy, e.tx, e.ty)}
              fill="none"
              stroke={e.color}
              strokeWidth={e.width}
              opacity={e.opacity}
              strokeDasharray={e.dashed ? "4 2" : undefined}
            />
          ))}

          {/* Nodes */}
          {dagNodes.map((n, i) => (
            <g key={`dn${i}`}>
              {n.hub && !n.selected && !n.dimmed && (
                <circle cx={n.x} cy={n.y} r={n.r + 2.5} fill="none" stroke={n.color} strokeWidth={0.8} opacity={0.25} />
              )}
              {n.selected && (
                <circle cx={n.x} cy={n.y} r={n.r + 3} fill="none" stroke="var(--color-foreground)" strokeWidth={0.6} opacity={0.3}>
                  <animate attributeName="r" from={String(n.r + 2)} to={String(n.r + 8)} dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.3" to="0" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}
              <circle
                cx={n.x} cy={n.y} r={n.r}
                fill={n.selected ? "var(--color-foreground)" : n.color}
                opacity={n.dimmed ? 0.15 : 0.9}
              />
              <text
                x={n.x} y={n.y + n.r + 9}
                textAnchor="middle"
                fill={n.selected ? "var(--color-foreground)" : "var(--color-muted-foreground)"}
                fontSize={n.selected ? 7.5 : 6.5}
                fontFamily="JetBrains Mono, monospace"
                opacity={n.dimmed ? 0.4 : 0.85}
              >
                {n.label}
              </text>
            </g>
          ))}
        </svg>

        {/* View toggle */}
        <div className="absolute bottom-3 left-3 flex overflow-hidden rounded-md border border-border/50 bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-1 px-2.5 py-1.5">
            <Globe className="size-3 text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground">Galaxy</span>
          </div>
          <div className="flex items-center gap-1 bg-accent px-2.5 py-1.5">
            <Layers className="size-3 text-accent-foreground" />
            <span className="text-[10px] font-medium text-accent-foreground">DAG</span>
          </div>
        </div>

        {/* Tooltip */}
        <div className="absolute left-[160px] top-[68px] rounded-md border border-border bg-popover/95 px-3 py-2 shadow-lg backdrop-blur-sm">
          <p className="font-mono text-[9px] font-medium text-popover-foreground">apps/daemon/src/mcp.ts</p>
          <div className="mt-1 flex gap-3 text-[8px] text-muted-foreground">
            <span>hub: <span className="text-amber-500 dark:text-amber-400">0.91</span></span>
            <span>imports: <span className="text-popover-foreground">6</span></span>
            <span>importers: <span className="text-popover-foreground">3</span></span>
            <span>layer: <span className="text-popover-foreground">1</span></span>
          </div>
        </div>
      </div>
    </ScreenshotFrame>
  );
}

/* ------------------------------------------------------------------ */
/*  Overview preview                                                   */
/* ------------------------------------------------------------------ */

function OverviewPreview() {
  return (
    <ScreenshotFrame title="Overview" caption="System snapshot at a glance">
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((s) => <StatCard key={s.label} {...s} />)}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {overviewRepos.map((r) => (
            <div key={r.name} className="rounded-lg border border-border/70 bg-background/55 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{r.name}</span>
                <Badge>indexed</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{r.path}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  ["Files", r.files],
                  ["Edges", r.edges],
                  ["Hubs", r.hubs],
                ].map(([label, val]) => (
                  <div key={label as string} className="rounded-md border border-border/70 px-2 py-1.5 text-center">
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                    <p className="font-mono text-xs font-medium tabular-nums">{(val as number).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScreenshotFrame>
  );
}

/* ------------------------------------------------------------------ */
/*  Extra pages list                                                   */
/* ------------------------------------------------------------------ */

const extraPages = [
  { icon: Terminal, name: "Traces", desc: "Live trace waterfall of every API and MCP request with spans, latency, and payloads" },
  { icon: Database, name: "Explorer", desc: "Browse files, symbols, imports, exports, and co-change pairs per repo" },
];

/* ------------------------------------------------------------------ */
/*  Feature callouts for graph views                                   */
/* ------------------------------------------------------------------ */

const graphFeatures = [
  {
    title: "3D Force Layout",
    detail: "Fibonacci-sphere clustering + d3-force-3d simulation. Directory clusters form visible groups. Hub files glow brighter. Auto-rotate, drag, zoom.",
  },
  {
    title: "Focus Mode",
    detail: "Click any file — camera flies to it, connected nodes rearrange around it, everything else dims. See imports (blue), importers (green), co-changes (amber dashed).",
  },
  {
    title: "Topological Layers",
    detail: "DAG view sorts files by longest-path layering. Entry points at top, leaves at bottom. See the full dependency flow at a glance.",
  },
  {
    title: "File Info Panel",
    detail: "Select a file to see exports, symbols, importers, imports, co-change partners, commit stats, hub score — all in one panel.",
  },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

function DashboardPage() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="border-b border-border py-20">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Dashboard
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            See your codebase<br className="hidden sm:block" /> in 3D
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Galaxy view renders your import graph as a 3D force-directed scene.
            DAG view shows the topological hierarchy. Both views are interactive
            — click any file to explore its neighborhood.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            <code className="rounded border border-border/70 bg-muted/45 px-2 py-1 font-mono text-xs">lens daemon start</code>{" "}
            then open{" "}
            <code className="rounded border border-border/70 bg-muted/45 px-2 py-1 font-mono text-xs">localhost:4111</code>
          </p>
        </div>
      </section>

      {/* Graph previews — hero section */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl space-y-14 px-6">
          <GalaxyPreview />

          {/* Feature callouts */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {graphFeatures.map((f) => (
              <div key={f.title} className="rounded-xl border border-border/70 bg-card/70 p-4">
                <h3 className="text-sm font-semibold text-card-foreground">{f.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{f.detail}</p>
              </div>
            ))}
          </div>

          <DagPreview />
        </div>
      </section>

      {/* Overview + other pages */}
      <section className="border-t border-border py-20">
        <div className="mx-auto max-w-6xl space-y-14 px-6">
          <OverviewPreview />

          <div>
            <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
              And More
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
              Additional pages ship with the dashboard.
            </p>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {extraPages.map((p) => (
                <div key={p.name} className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-5">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/55 to-transparent opacity-80" />
                  <div className="flex gap-4">
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
                      <p.icon className="size-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-card-foreground">{p.name}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Get Started</h2>
          <p className="mt-3 text-muted-foreground">
            Install LENS, register a repo, and explore the graph.
          </p>
          <div className="mx-auto mt-5 max-w-xl overflow-hidden rounded-lg border border-border/70">
            <div className="flex items-center justify-between border-b border-border/70 px-3 py-1.5 sm:px-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Terminal
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">bash</span>
            </div>
            <pre className="overflow-x-auto px-3 py-3 font-mono text-sm text-foreground sm:px-4 sm:py-4">
              <span className="text-muted-foreground/60">$ </span>
              <span className="text-primary">lens</span> daemon start
            </pre>
          </div>
          <Link
            to="/docs"
            className="mt-6 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Read the Docs
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
