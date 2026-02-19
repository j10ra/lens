import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";

export type Repo = {
  id: string;
  name: string;
  root_path: string;
  index_status: string;
  last_indexed_at: string | null;
};

export function useRepos() {
  return useQuery<Repo[]>({
    queryKey: ["repos"],
    queryFn: () => api.repos(),
    refetchInterval: 10_000,
  });
}
