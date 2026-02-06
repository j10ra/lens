import { api } from "encore.dev/api";
import { db } from "../repo/db";
import { ensureSummarized, type SummaryResult } from "./ensure";
import { generateRepoMap } from "./repomap";

// --- POST /summary/generate ---

interface GenerateParams {
  repo_id: string;
  paths?: string[];
}

interface GenerateResponse extends SummaryResult {}

export const generate = api(
  { expose: true, method: "POST", path: "/summary/generate" },
  async (params: GenerateParams): Promise<GenerateResponse> => {
    return ensureSummarized(params.repo_id, params.paths);
  },
);

// --- GET /summary/:repo_id/file ---

interface FileParams {
  repo_id: string;
  path: string;
}

interface FileSummaryResponse {
  path: string;
  summary: string;
  key_exports: string[];
  dependencies: string[];
  cached: boolean;
}

export const file = api(
  { expose: true, method: "GET", path: "/summary/:repo_id/file" },
  async (params: FileParams): Promise<FileSummaryResponse> => {
    const row = await db.queryRow<{
      summary: string;
      key_exports: string | string[];
      dependencies: string | string[];
    }>`
      SELECT summary, key_exports, dependencies FROM summaries
      WHERE repo_id = ${params.repo_id} AND path = ${params.path} AND level = 'file'
      ORDER BY updated_at DESC LIMIT 1
    `;

    if (!row) {
      throw new Error(`No summary for ${params.path}`);
    }

    const parseJsonb = (v: string | string[] | null): string[] => {
      if (!v) return [];
      if (Array.isArray(v)) return v;
      try { return JSON.parse(v); } catch { return []; }
    };

    return {
      path: params.path,
      summary: row.summary,
      key_exports: parseJsonb(row.key_exports),
      dependencies: parseJsonb(row.dependencies),
      cached: true,
    };
  },
);

// --- GET /summary/:repo_id/map ---

interface MapParams {
  repo_id: string;
  max_depth?: number;
}

interface MapResponse {
  map: string;
}

export const map = api(
  { expose: true, method: "GET", path: "/summary/:repo_id/map" },
  async (params: MapParams): Promise<MapResponse> => {
    const content = await generateRepoMap(params.repo_id, {
      maxDepth: params.max_depth ?? 3,
    });
    return { map: content };
  },
);
