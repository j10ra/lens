import { useState, useEffect, useRef, useCallback } from "react";
import { Copy, Check } from "lucide-react";

const BASE_NODES = [
  // Row 1 (y ~5–20)
  { x: 5, y: 8 },  { x: 20, y: 14 }, { x: 35, y: 6 },  { x: 52, y: 18 },
  { x: 68, y: 10 }, { x: 84, y: 16 }, { x: 95, y: 5 },
  // Row 2 (y ~25–40)
  { x: 10, y: 30 }, { x: 28, y: 36 }, { x: 44, y: 28 }, { x: 60, y: 38 },
  { x: 76, y: 32 }, { x: 92, y: 38 },
  // Row 3 (y ~42–58)
  { x: 4, y: 48 },  { x: 18, y: 54 }, { x: 36, y: 46 }, { x: 52, y: 56 },
  { x: 68, y: 44 }, { x: 84, y: 52 }, { x: 96, y: 48 },
  // Row 4 (y ~62–78)
  { x: 8, y: 66 },  { x: 24, y: 72 }, { x: 40, y: 64 }, { x: 56, y: 74 },
  { x: 72, y: 68 }, { x: 88, y: 76 },
  // Row 5 (y ~82–96)
  { x: 12, y: 86 }, { x: 30, y: 92 }, { x: 50, y: 84 }, { x: 70, y: 90 },
];

const EDGES: [number, number][] = [
  // Row chains
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6],
  [7, 8], [8, 9], [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16], [16, 17], [17, 18], [18, 19],
  [20, 21], [21, 22], [22, 23], [23, 24], [24, 25],
  [26, 27], [27, 28], [28, 29],
  // Vertical connections
  [0, 7], [1, 8], [3, 10], [5, 12],
  [7, 13], [8, 14], [9, 15], [11, 17], [12, 19],
  [13, 20], [14, 21], [16, 23], [17, 24], [19, 25],
  [20, 26], [22, 27], [23, 28], [25, 29],
  // Diagonals
  [2, 9], [4, 11], [10, 16], [15, 22], [18, 25], [24, 29],
];

// Each node gets a unique phase offset + speed for organic drift
const DRIFT = BASE_NODES.map((_, i) => ({
  phaseX: (i * 2.39) % (Math.PI * 2), // golden-angle spacing
  phaseY: (i * 1.73) % (Math.PI * 2),
  speedX: 0.35 + (i % 5) * 0.08,      // 0.35–0.67 rad/s
  speedY: 0.28 + (i % 7) * 0.06,      // 0.28–0.64 rad/s
  ampX: 0.8 + (i % 3) * 0.4,          // 0.8–1.6 units
  ampY: 0.6 + (i % 4) * 0.3,          // 0.6–1.5 units
}));

function NetworkGraph() {
  const svgRef = useRef<SVGSVGElement>(null);
  const frameRef = useRef(0);

  const animate = useCallback((t: number) => {
    const svg = svgRef.current;
    if (!svg) return;

    const sec = t / 1000;
    const lines = svg.querySelectorAll("line");
    const circles = svg.querySelectorAll("circle");

    for (let i = 0; i < BASE_NODES.length; i++) {
      const d = DRIFT[i];
      const nx = BASE_NODES[i].x + Math.sin(sec * d.speedX + d.phaseX) * d.ampX;
      const ny = BASE_NODES[i].y + Math.cos(sec * d.speedY + d.phaseY) * d.ampY;
      circles[i]?.setAttribute("cx", String(nx));
      circles[i]?.setAttribute("cy", String(ny));
    }

    for (let i = 0; i < EDGES.length; i++) {
      const [a, b] = EDGES[i];
      const da = DRIFT[a];
      const db = DRIFT[b];
      const ax = BASE_NODES[a].x + Math.sin(sec * da.speedX + da.phaseX) * da.ampX;
      const ay = BASE_NODES[a].y + Math.cos(sec * da.speedY + da.phaseY) * da.ampY;
      const bx = BASE_NODES[b].x + Math.sin(sec * db.speedX + db.phaseX) * db.ampX;
      const by = BASE_NODES[b].y + Math.cos(sec * db.speedY + db.phaseY) * db.ampY;
      const line = lines[i];
      if (line) {
        line.setAttribute("x1", String(ax));
        line.setAttribute("y1", String(ay));
        line.setAttribute("x2", String(bx));
        line.setAttribute("y2", String(by));
      }
    }

    frameRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [animate]);

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 h-full w-full opacity-[0.07]"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {EDGES.map(([a, b], i) => (
        <line
          key={i}
          x1={BASE_NODES[a].x}
          y1={BASE_NODES[a].y}
          x2={BASE_NODES[b].x}
          y2={BASE_NODES[b].y}
          stroke="currentColor"
          strokeWidth="0.15"
        />
      ))}
      {BASE_NODES.map((n, i) => (
        <circle
          key={i}
          cx={n.x}
          cy={n.y}
          r="0.4"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

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

      {/* Animated network graph background */}
      <NetworkGraph />

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
