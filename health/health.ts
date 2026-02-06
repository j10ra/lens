import { api } from "encore.dev/api";

interface HealthResponse {
  status: string;
  version: string;
}

export const check = api(
  { expose: true, method: "GET", path: "/health" },
  async (): Promise<HealthResponse> => {
    return { status: "ok", version: "0.1.0" };
  },
);
