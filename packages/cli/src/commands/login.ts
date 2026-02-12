import http from "node:http";
import { writeAuth } from "../util/auth.js";
import { post } from "../util/client.js";
import { openBrowser } from "../util/browser.js";
import { output, error } from "../util/format.js";

const SUPABASE_URL = "https://kuvsaycpvbbmyyxiklap.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dnNheWNwdmJibXl5eGlrbGFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MzIxNzQsImV4cCI6MjA4NjIwODE3NH0.yllrNUWVHUyFBwegoIeBkiHiIiWcsspHL9126nT2o2Q";
import { getCloudUrl } from "../util/config.js";

const CLOUD_API_URL = getCloudUrl();

interface LoginOpts {
  github?: boolean;
  google?: boolean;
}

function chooserPage(port: number): string {
  const redirect = `http://localhost:${port}/callback`;
  const ghUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(redirect)}`;
  const goUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>LENS Login</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fafafa; }
  .card { text-align: center; padding: 3rem; border: 1px solid #333; border-radius: 12px; background: #111; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  p { color: #888; margin-bottom: 2rem; }
  a { display: block; padding: 0.75rem 2rem; margin: 0.75rem 0; border-radius: 8px; text-decoration: none; font-weight: 500; transition: opacity 0.15s; }
  a:hover { opacity: 0.85; }
  .gh { background: #24292e; color: #fff; }
  .go { background: #fff; color: #333; }
</style></head><body>
<div class="card">
  <h1>Sign in to LENS</h1>
  <p>Choose a provider to authenticate your CLI</p>
  <a class="gh" href="${ghUrl}">Continue with GitHub</a>
  <a class="go" href="${goUrl}">Continue with Google</a>
</div></body></html>`;
}

function callbackPage(): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>LENS Dashboard Login</title>
<style>
  :root {
    --background: #171717;
    --foreground: #fafafa;
    --card: #212121;
    --card-foreground: #f5f5f5;
    --muted: #2d2d2d;
    --muted-foreground: #a1a1aa;
    --border: rgba(255, 255, 255, 0.1);
    --ring: rgba(255, 255, 255, 0.2);
    --primary: #ebebeb;
    --primary-foreground: #222222;
    --success: #55d6a5;
    --destructive: #ff8c8c;
    --network-line: 125, 211, 252;
    --network-node: 207, 239, 255;
  }
  * { box-sizing: border-box; }
  html, body { width: 100%; height: 100%; margin: 0; }
  body {
    position: relative;
    overflow: hidden;
    display: grid;
    place-items: center;
    background: radial-gradient(circle at 20% 0%, #222222 0%, transparent 40%), var(--background);
    color: var(--foreground);
    font-family: "Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: -0.01em;
  }
  #network {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0.74;
  }
  .overlay {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at center, transparent 20%, rgba(0, 0, 0, 0.44) 82%),
      linear-gradient(180deg, rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.26));
    pointer-events: none;
  }
  .inner {
    position: relative;
    z-index: 1;
    width: min(500px, calc(100vw - 2rem));
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--card) 88%, transparent);
    color: var(--card-foreground);
    padding: 1.25rem 1.25rem 1.15rem;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.42);
    backdrop-filter: blur(5px);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    text-align: left;
  }
  .brand-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.5rem;
    font-size: 0.82rem;
    font-weight: 700;
    background: var(--primary);
    color: var(--primary-foreground);
  }
  .brand-copy {
    display: grid;
    gap: 0.08rem;
  }
  .brand-copy strong {
    font-size: 0.9rem;
    line-height: 1;
  }
  .brand-copy span {
    color: var(--muted-foreground);
    font-size: 0.72rem;
  }
  h1 {
    margin: 1.05rem 0 0;
    font-size: clamp(1.2rem, 2.1vw, 1.55rem);
    letter-spacing: -0.02em;
    font-weight: 600;
    text-align: left;
  }
  p {
    margin: 0.55rem 0 0;
    color: var(--muted-foreground);
    font-size: 0.9rem;
    line-height: 1.5;
    text-align: left;
  }
  .status-chip {
    margin-top: 0.95rem;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    border: 1px solid var(--border);
    background: var(--muted);
    border-radius: 999px;
    padding: 0.26rem 0.6rem;
    color: #d4d4d8;
    font-size: 0.74rem;
    line-height: 1;
  }
  .status-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    background: #d4d4d8;
    color: rgba(212, 212, 216, 0.5);
    box-shadow: 0 0 0 0 currentColor;
    animation: ping 1.6s ease-out infinite;
  }
  .status-dot.ok {
    background: var(--success);
    color: rgba(85, 214, 165, 0.55);
  }
  .status-dot.err {
    background: var(--destructive);
    color: rgba(255, 140, 140, 0.58);
  }
  @keyframes ping {
    0% { box-shadow: 0 0 0 0 currentColor; }
    70% { box-shadow: 0 0 0 11px rgba(0, 0, 0, 0); }
    100% { box-shadow: 0 0 0 0 rgba(0, 0, 0, 0); }
  }
  @media (max-width: 560px) {
    .inner { padding: 1rem; }
    .brand-mark { width: 1.8rem; height: 1.8rem; }
    h1 { font-size: 1.08rem; }
    p { font-size: 0.84rem; }
  }
</style></head><body>
<canvas id="network" aria-hidden="true"></canvas>
<div class="overlay" aria-hidden="true"></div>
<main class="inner" role="status" aria-live="polite">
  <div class="brand">
    <div class="brand-mark">L</div>
    <div class="brand-copy"><strong>LENS</strong><span>Workspace</span></div>
  </div>
  <h1 id="title">Authenticating...</h1>
  <p id="msg">Processing OAuth callback tokens.</p>
  <div class="status-chip"><span class="status-dot" id="pulse"></span><span id="submsg">Securing local session</span></div>
</main>
<script>
(() => {
  const canvas = document.getElementById("network");
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width = 0;
  let height = 0;
  let nodes = [];
  let maxDist = 150;
  const lineColor = "125, 211, 252";
  const nodeColor = "207, 239, 255";

  function seedNodes() {
    const count = Math.max(34, Math.min(84, Math.floor((width * height) / 18000)));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.32,
      vy: (Math.random() - 0.5) * 0.32,
      r: 1 + Math.random() * 1.25,
    }));
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    maxDist = Math.max(130, Math.min(210, Math.min(width, height) * 0.26));
    seedNodes();
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      a.x += a.vx;
      a.y += a.vy;

      if (a.x <= 0 || a.x >= width) a.vx *= -1;
      if (a.y <= 0 || a.y >= height) a.vy *= -1;

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist > maxDist) continue;

        const alpha = Math.pow(1 - dist / maxDist, 2) * 0.62;
        ctx.strokeStyle = "rgba(" + lineColor + ", " + alpha.toFixed(3) + ")";
        ctx.lineWidth = 0.78;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    for (const n of nodes) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + nodeColor + ", 0.93)";
      ctx.fill();
    }

    requestAnimationFrame(animate);
  }

  resize();
  window.addEventListener("resize", resize);
  requestAnimationFrame(animate);
})();

(async () => {
  const title = document.getElementById("title");
  const msg = document.getElementById("msg");
  const submsg = document.getElementById("submsg");
  const pulse = document.getElementById("pulse");

  function setState(headline, detail, subDetail, tone) {
    if (title) title.textContent = headline;
    if (msg) msg.textContent = detail;
    if (submsg) submsg.textContent = subDetail || "";
    if (pulse) {
      pulse.classList.remove("ok", "err");
      if (tone) pulse.classList.add(tone);
    }
  }

  try {
    setState("Authenticating...", "Validating callback token payload.", "Contacting identity service");

    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const expires_in = params.get("expires_in");

    if (!access_token) {
      setState("Authentication failed", "No access token received. Please try login again.", "Missing OAuth token", "err");
      return;
    }

    let user_email = "unknown";
    try {
      const res = await fetch("${SUPABASE_URL}/auth/v1/user", {
        headers: {
          "Authorization": "Bearer " + access_token,
          "apikey": "${SUPABASE_ANON_KEY}"
        }
      });
      if (res.ok) {
        const user = await res.json();
        user_email = user && user.email ? user.email : "unknown";
      }
    } catch {}

    setState("Initializing workspace...", "Saving secure credentials to local daemon.", "Provisioning CLI session");

    const r = await fetch("/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token, refresh_token, expires_in, user_email })
    });

    if (r.ok) {
      setState("Success", "Session established. Redirecting to dashboard...", "Opening local dashboard", "ok");
      setTimeout(() => {
        window.location.href = "http://127.0.0.1:4111/dashboard/";
      }, 280);
      return;
    }

    setState("Authentication failed", "Failed to save tokens. Please close this tab and try again.", "Token persistence failed", "err");
  } catch (e) {
    const detail = e && typeof e.message === "string" ? e.message : "Unknown error";
    setState("Authentication failed", "Error: " + detail, "Unexpected callback exception", "err");
  }
})();
</script></body></html>`;
}

export async function loginCommand(opts: LoginOpts): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost`);

      if (req.method === "GET" && url.pathname === "/") {
        const addr = server.address() as { port: number };
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(chooserPage(addr.port));
        return;
      }

      if (req.method === "GET" && url.pathname === "/callback") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(callbackPage());
        return;
      }

      if (req.method === "POST" && url.pathname === "/token") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", async () => {
          try {
            const { access_token, refresh_token, expires_in, user_email } = JSON.parse(body);
            const expires_at = Math.floor(Date.now() / 1000) + Number(expires_in || 3600);

            const tokens = { access_token, refresh_token, user_email, expires_at } as import("../util/auth.js").AuthTokens;

            // Provision cloud API key
            try {
              const keyRes = await fetch(`${CLOUD_API_URL}/auth/key`, {
                headers: { Authorization: `Bearer ${access_token}` },
              });
              if (keyRes.ok) {
                const { api_key } = await keyRes.json() as { api_key: string };
                tokens.api_key = api_key;
              } else {
                error(`Cloud API key failed (${keyRes.status}). Cloud features unavailable until daemon restarts.`);
              }
            } catch (e: any) {
              error(`Cloud unreachable: ${e?.message ?? "unknown"}. Daemon will retry on next start.`);
            }

            await writeAuth(tokens);

            // Notify daemon — refreshes quota cache so dashboard loads with correct plan
            try { await post("/api/auth/notify"); } catch {}

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));

            output(`Logged in as ${user_email}`, false);
            if (tokens.api_key) output("Cloud API key provisioned", false);
            cleanup();
            resolve();
            setTimeout(() => process.exit(0), 100);
          } catch (err) {
            res.writeHead(400);
            res.end("Bad request");
          }
        });
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    const timeout = setTimeout(() => {
      error("Login timed out (120s). Please try again.");
      cleanup();
      reject(new Error("Login timed out"));
    }, 120_000);

    function cleanup() {
      clearTimeout(timeout);
      server.close();
    }

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      const port = addr.port;
      const redirect = encodeURIComponent(`http://localhost:${port}/callback`);

      let url: string;
      if (opts.github) {
        url = `${SUPABASE_URL}/auth/v1/authorize?provider=github&redirect_to=${redirect}`;
      } else if (opts.google) {
        url = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${redirect}`;
      } else {
        url = `http://localhost:${port}/`;
      }

      output(`Opening browser for authentication...`, false);
      openBrowser(url);
    });
  });
}
