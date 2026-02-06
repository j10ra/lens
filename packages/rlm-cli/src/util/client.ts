const BASE_URL = process.env.RLM_HOST ?? "http://127.0.0.1:4000";
const VERBOSE = process.env.RLM_VERBOSE === "1" || process.argv.includes("--verbose") || process.argv.includes("-v");

export class DaemonError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Daemon returned ${status}`);
    this.name = "DaemonError";
  }
}

export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  if (VERBOSE) {
    process.stderr.write(`[RLM] ${method} ${url}\n`);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ECONNREFUSED") {
      throw new Error("RLM daemon is not running. Start it with: encore run");
    }
    throw err;
  }

  const data = await res.json();

  if (VERBOSE) {
    process.stderr.write(`[RLM] ${res.status} ${res.statusText}\n`);
  }

  if (!res.ok) {
    throw new DaemonError(res.status, data);
  }

  return data as T;
}

export const get = <T>(path: string) => request<T>("GET", path);
export const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body);
