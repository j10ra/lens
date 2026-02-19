import { randomUUID } from "node:crypto";
import { type Span, storage, type TraceContext } from "./context.js";
import type { TraceStore } from "./trace-store.js";

// Global TraceStore reference — set via configure() before first lensFn call
let _store: TraceStore | undefined;

export function configureLensFn(store: TraceStore): void {
  _store = store;
}

export function lensFn<TArgs extends unknown[], TReturn>(
  name: string,
  fn: (...args: TArgs) => Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const parent = storage.getStore();
    const spanId = randomUUID();
    const traceId = parent?.traceId ?? randomUUID();

    const parentSpanId = parent?.spanStack.at(-1)?.spanId;
    const span: Span = { spanId, parentSpanId, name, startMs: Date.now() };

    const ctx: TraceContext = {
      traceId,
      spanStack: parent ? [...parent.spanStack, span] : [span],
    };

    const startMs = Date.now();

    return storage.run(ctx, async () => {
      try {
        const result = await fn(...args);
        const inputSize = estimateSize(args);
        const outputSize = estimateSize(result);
        _store?.pushSpan({
          spanId,
          traceId,
          parentSpanId,
          name,
          startedAt: startMs,
          durationMs: Date.now() - startMs,
          inputSize,
          outputSize,
        });
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        _store?.pushSpan({
          spanId,
          traceId,
          parentSpanId,
          name,
          startedAt: startMs,
          durationMs: Date.now() - startMs,
          errorMessage,
        });
        throw err;
      }
    });
  };
}

function estimateSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}
