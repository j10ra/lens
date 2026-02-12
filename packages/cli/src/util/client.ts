const BASE_URL = process.env.LENS_HOST ?? "http://127.0.0.1:4111";
const VERBOSE = process.env.LENS_VERBOSE === "1" || process.argv.includes("--verbose") || process.argv.includes("-v");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class DaemonError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Daemon returned ${status}`);
    this.name = "DaemonError";
  }
}

export async function request<T>(method: string, path: string, body?: unknown, retries = 3): Promise<T> {
  const url = `${BASE_URL}${path}`;
  if (VERBOSE) {
    process.stderr.write(`[LENS] ${method} ${url}\n`);
  }

  for (let i = 0; i < retries; i++) {
    let res: Response;
    try {
      const headers: Record<string, string> = { "User-Agent": "lens-cli" };
      if (body) headers["Content-Type"] = "application/json";
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(60000), // 60s timeout
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ECONNREFUSED") {
        throw new Error("LENS daemon is not running. Start with: lens start");
      }
      if (i === retries - 1) throw err;
      await sleep(500);
      continue;
    }

    const data = await res.json();

    if (VERBOSE) {
      process.stderr.write(`[LENS] ${res.status} ${res.statusText}\n`);
    }

    if (!res.ok) {
      throw new DaemonError(res.status, data);
    }

    return data as T;
  }

  throw new Error("fetch failed");
}

export const get = <T>(path: string) => request<T>("GET", path);
export const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body);
