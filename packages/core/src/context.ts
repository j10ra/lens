import { AsyncLocalStorage } from "node:async_hooks";

export interface Span {
  spanId: string;
  parentSpanId: string | undefined;
  name: string;
  startMs: number;
}

export interface TraceContext {
  traceId: string;
  spanStack: Span[];
}

export const storage = new AsyncLocalStorage<TraceContext>();

/** Returns the deepest active span, or undefined if outside any lensFn/lensRoute context. */
export function currentSpan(): Span | undefined {
  const store = storage.getStore();
  return store?.spanStack.at(-1);
}
