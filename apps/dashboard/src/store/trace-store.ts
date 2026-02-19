import { createStore, useStore } from "@tanstack/react-store";

interface TraceUIState {
  selectedTraceId: string | null;
  filterText: string;
}

export const traceStore = createStore<TraceUIState>({
  selectedTraceId: null,
  filterText: "",
});

export const useSelectedTraceId = () => useStore(traceStore, (s) => s.selectedTraceId);

export const useTraceFilter = () => useStore(traceStore, (s) => s.filterText);

export const selectTrace = (id: string | null) => traceStore.setState((s) => ({ ...s, selectedTraceId: id }));

export const setTraceFilter = (text: string) => traceStore.setState((s) => ({ ...s, filterText: text }));
