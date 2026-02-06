import { api, APIError } from "encore.dev/api";
import { db } from "./db";
import { deriveIdentityKey } from "./identity";

// --- Types ---

interface RegisterParams {
  root_path: string;
  name?: string;
  remote_url?: string;
}

interface RegisterResponse {
  repo_id: string;
  identity_key: string;
  name: string;
  created: boolean;
}

interface RepoRow {
  id: string;
  identity_key: string;
  name: string;
  root_path: string;
  remote_url: string | null;
  created_at: Date;
  updated_at: Date;
}

interface GetParams {
  id: string;
}

interface ListResponse {
  repos: RepoRow[];
}

// --- Endpoints ---

export const register = api(
  { expose: true, method: "POST", path: "/repo/register" },
  async (params: RegisterParams): Promise<RegisterResponse> => {
    const identityKey = deriveIdentityKey(params.root_path, params.remote_url);
    const name = params.name ?? params.root_path.split("/").pop() ?? "unknown";

    const row = await db.queryRow<{ id: string; created: boolean }>`
      INSERT INTO repos (identity_key, name, root_path, remote_url)
      VALUES (${identityKey}, ${name}, ${params.root_path}, ${params.remote_url ?? null})
      ON CONFLICT (identity_key) DO UPDATE
        SET root_path = EXCLUDED.root_path,
            remote_url = COALESCE(EXCLUDED.remote_url, repos.remote_url),
            updated_at = now()
      RETURNING id, (xmax = 0) AS created
    `;

    if (!row) throw APIError.internal("failed to upsert repo");

    return {
      repo_id: row.id,
      identity_key: identityKey,
      name,
      created: row.created,
    };
  },
);

export const get = api(
  { expose: true, method: "GET", path: "/repo/:id" },
  async ({ id }: GetParams): Promise<RepoRow> => {
    const row = await db.queryRow<RepoRow>`
      SELECT id, identity_key, name, root_path, remote_url, created_at, updated_at
      FROM repos WHERE id = ${id}
    `;
    if (!row) throw APIError.notFound("repo not found");
    return row;
  },
);

export const list = api(
  { expose: true, method: "GET", path: "/repo/list" },
  async (): Promise<ListResponse> => {
    const rows = db.query<RepoRow>`
      SELECT id, identity_key, name, root_path, remote_url, created_at, updated_at
      FROM repos ORDER BY created_at DESC
    `;
    const repos: RepoRow[] = [];
    for await (const row of rows) {
      repos.push(row);
    }
    return { repos };
  },
);
