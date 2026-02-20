const BASE = "http://localhost:4111";

export const DAEMON_URL = BASE;

export async function daemonFetch(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/cli${path}`, init);
  } catch {
    console.error("lens daemon is not running. Start it with: lens daemon start");
    process.exit(1);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res;
}
