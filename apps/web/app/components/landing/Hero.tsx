import { useState, useEffect, useRef, useCallback } from "react";
import { Copy, Check } from "lucide-react";

type Vertex4 = { x: number; y: number; z: number; w: number };
type Edge4 = { a: number; b: number; dim: number };
type ProjectedPoint = { x: number; y: number; z: number; w: number; depth: number };

const TESSERACT_VERTICES: Vertex4[] = Array.from({ length: 16 }, (_, i) => ({
  x: i & 1 ? 1 : -1,
  y: i & 2 ? 1 : -1,
  z: i & 4 ? 1 : -1,
  w: i & 8 ? 1 : -1,
}));

const TESSERACT_EDGES: Edge4[] = [];
for (let i = 0; i < 16; i++) {
  for (let dim = 0; dim < 4; dim++) {
    const j = i ^ (1 << dim);
    if (i < j) TESSERACT_EDGES.push({ a: i, b: j, dim });
  }
}

const ANIMATION_SPEED = 0.22;
const VIEWBOX_CENTER = 50;
const GRAPH_SCALE = 17.5;
const FOUR_D_DISTANCE = 3.5;
const THREE_D_DISTANCE = 4.1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rotate2D(a: number, b: number, angle: number): [number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [a * c - b * s, a * s + b * c];
}

function projectTesseract(sec: number): ProjectedPoint[] {
  return TESSERACT_VERTICES.map((v, i) => {
    let x = v.x;
    let y = v.y;
    let z = v.z;
    let w = v.w;

    [x, y] = rotate2D(x, y, sec * 0.51 + i * 0.02);
    [z, w] = rotate2D(z, w, sec * 0.47 - i * 0.01);
    [x, w] = rotate2D(x, w, sec * 0.33);
    [y, z] = rotate2D(y, z, sec * 0.29);
    [x, z] = rotate2D(x, z, sec * 0.24);
    [y, w] = rotate2D(y, w, sec * 0.21);

    const wPerspective = FOUR_D_DISTANCE / (FOUR_D_DISTANCE - w);
    const x3 = x * wPerspective;
    const y3 = y * wPerspective;
    const z3 = z * wPerspective;

    const zPerspective = THREE_D_DISTANCE / (THREE_D_DISTANCE - z3);
    const sx = VIEWBOX_CENTER + x3 * zPerspective * GRAPH_SCALE;
    const sy = VIEWBOX_CENTER + y3 * zPerspective * GRAPH_SCALE;
    const depth = clamp((z3 + 2.2) / 4.4, 0, 1);

    return { x: sx, y: sy, z: z3, w, depth };
  });
}

function NetworkGraph() {
  const svgRef = useRef<SVGSVGElement>(null);
  const frameRef = useRef(0);
  const initialPoints = projectTesseract(0);

  const animate = useCallback((t: number) => {
    const svg = svgRef.current;
    if (!svg) return;

    const sec = (t / 1000) * ANIMATION_SPEED;
    const lines = svg.querySelectorAll<SVGLineElement>("line");
    const circles = svg.querySelectorAll<SVGCircleElement>("circle");
    const projected = projectTesseract(sec);

    for (let i = 0; i < projected.length; i++) {
      const node = projected[i];
      const circle = circles[i];
      if (!circle) continue;

      circle.setAttribute("cx", String(node.x));
      circle.setAttribute("cy", String(node.y));
      circle.setAttribute("r", String(0.14 + node.depth * 0.34));
      circle.setAttribute(
        "opacity",
        String(clamp(0.26 + node.depth * 0.56 + Math.abs(node.w) * 0.08, 0.18, 0.95)),
      );
    }

    for (let i = 0; i < TESSERACT_EDGES.length; i++) {
      const edge = TESSERACT_EDGES[i];
      const aNode = projected[edge.a];
      const bNode = projected[edge.b];
      const line = lines[i];
      if (line) {
        const depth = (aNode.depth + bNode.depth) / 2;
        const hyper = (Math.abs(aNode.w) + Math.abs(bNode.w)) / 2;
        const bridgeBoost = edge.dim === 3 ? 1.34 : 1;

        line.setAttribute("x1", String(aNode.x));
        line.setAttribute("y1", String(aNode.y));
        line.setAttribute("x2", String(bNode.x));
        line.setAttribute("y2", String(bNode.y));
        line.setAttribute("stroke", edge.dim === 3 ? "var(--color-primary)" : "currentColor");
        line.setAttribute("stroke-width", String((0.045 + depth * 0.13) * bridgeBoost));
        line.setAttribute(
          "opacity",
          String(clamp(0.08 + depth * 0.3 + hyper * 0.07, 0.08, 0.72)),
        );
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
      className="absolute inset-0 h-full w-full opacity-[0.2]"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {TESSERACT_EDGES.map((edge, i) => (
        <line
          key={i}
          x1={initialPoints[edge.a].x}
          y1={initialPoints[edge.a].y}
          x2={initialPoints[edge.b].x}
          y2={initialPoints[edge.b].y}
          stroke="currentColor"
          strokeWidth="0.12"
        />
      ))}
      {initialPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="0.28"
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
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />
      <NetworkGraph />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_30%,_var(--color-background)_75%)]" />

      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-success">
          Open Source
        </p>
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">
          Code is a graph.
          <br />
          <span className="text-primary">Query the structure.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          LENS maps your repo — import graph traversal, co-change analysis, hub
          detection, <span className="whitespace-nowrap">TF-IDF</span> scoring
          — and delivers ranked results in one call. Fewer tokens wasted,
          smarter output.
        </p>

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

        <div className="mt-10 flex items-center justify-center gap-4">
          <a
            href="#how-it-works"
            className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Get Started
          </a>
          <a
            href="https://github.com/j10ra/lens"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border bg-card px-6 py-3 text-sm font-semibold text-card-foreground transition-colors hover:bg-accent"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
