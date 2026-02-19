import { createStore, useStore } from "@tanstack/react-store";

interface RepoState {
  selectedRepoId: string | null;
  selectedFilePath: string | null;
}

export const repoStore = createStore<RepoState>({
  selectedRepoId: null,
  selectedFilePath: null,
});

export const useSelectedRepoId = () => useStore(repoStore, (s) => s.selectedRepoId);

export const useSelectedFilePath = () => useStore(repoStore, (s) => s.selectedFilePath);

export const selectRepo = (id: string | null) =>
  repoStore.setState((s) => ({ ...s, selectedRepoId: id, selectedFilePath: null }));

export const selectFile = (path: string | null) => repoStore.setState((s) => ({ ...s, selectedFilePath: path }));
