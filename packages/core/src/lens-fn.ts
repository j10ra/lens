import { randomUUID } from "node:crypto";
import { type Span, storage, type TraceContext } from "./context.js";
import type { TraceStore } from "./trace-store.js";

let _store: TraceStore | undefined;

const MAX_CAPTURE = 8_192;

export function configureLensFn(store: TraceStore): void {
  _store = store;
}

function safeStringify(value: unknown): string | undefined {
  try {
    const json = JSON.stringify(value);
    return json && json.length <= MAX_CAPTURE ? json : undefined;
  } catch {
    return undefined;
  }
}

/** Serialize function args — drops non-serializable values (db handles, etc.) */
function serializeArgs(args: unknown[]): string | undefined {
  const direct = safeStringify(args);
  if (direct) return direct;
  // Drop non-serializable args (db handles), keep the rest
  const cleaned = args.filter((arg) => safeStringify(arg) != null);
  return cleaned.length ? safeStringify(cleaned) : undefined;
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
    const input = serializeArgs(args);

    return storage.run(ctx, async () => {
      try {
        const result = await fn(...args);
        const output = safeStringify(result);
        _store?.pushSpan({
          spanId,
          traceId,
          parentSpanId,
          name,
          startedAt: startMs,
          durationMs: Date.now() - startMs,
          inputSize: input?.length ?? 0,
          outputSize: output?.length ?? 0,
          input,
          output,
        });
        return result;
      } catch (err) {
        _store?.pushSpan({
          spanId,
          traceId,
          parentSpanId,
          name,
          startedAt: startMs,
          durationMs: Date.now() - startMs,
          errorMessage: err instanceof Error ? err.message : String(err),
          input,
        });
        throw err;
      }
    });
  };
}
