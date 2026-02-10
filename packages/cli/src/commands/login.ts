import http from "node:http";
import { writeAuth } from "../util/auth.js";
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
<html><head><meta charset="utf-8"><title>LENS Login</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fafafa; }
  .card { text-align: center; padding: 3rem; }
  h1 { font-size: 1.5rem; }
  p { color: #888; }
</style></head><body>
<div class="card">
  <h1>Authenticating...</h1>
  <p id="msg">Processing tokens...</p>
</div>
<script>
(async () => {
  const msg = document.getElementById("msg");
  try {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const expires_in = params.get("expires_in");

    if (!access_token) {
      msg.textContent = "No access token received. Please try again.";
      return;
    }

    // Fetch user info from Supabase
    const res = await fetch("${SUPABASE_URL}/auth/v1/user", {
      headers: {
        "Authorization": "Bearer " + access_token,
        "apikey": "${SUPABASE_ANON_KEY}"
      }
    });
    const user = await res.json();
    const user_email = user.email || "unknown";

    const r = await fetch("/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token, refresh_token, expires_in, user_email })
    });

    if (r.ok) {
      window.location.href = "http://127.0.0.1:4111/dashboard/";
      return;
    } else {
      msg.textContent = "Failed to save tokens. Please try again.";
    }
  } catch (e) {
    msg.textContent = "Error: " + e.message;
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
