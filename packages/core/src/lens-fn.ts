import { randomUUID } from "node:crypto";
import { type Span, storage, type TraceContext } from "./context.js";
import type { TraceStore } from "./trace-store.js";

let _store: TraceStore | undefined;

const MAX_CAPTURE = 262_144;

export function configureLensFn(store: TraceStore): void {
  _store = store;
}

function captureJson(value: unknown): { text?: string; size?: number } {
  try {
    const json = JSON.stringify(value);
    if (!json) return {};
    if (json.length <= MAX_CAPTURE) return { text: json, size: json.length };

    const truncatedChars = json.length - MAX_CAPTURE;
    const suffix = `... [truncated ${truncatedChars} chars]`;
    const headSize = Math.max(0, MAX_CAPTURE - suffix.length);
    return { text: `${json.slice(0, headSize)}${suffix}`, size: json.length };
  } catch {
    return {};
  }
}

/** Serialize function args — drops non-serializable values (db handles, etc.) */
function serializeArgs(args: unknown[]): string | undefined {
  const direct = captureJson(args).text;
  if (direct) return direct;
  // Drop non-serializable args (db handles), keep the rest
  const cleaned = args.filter((arg) => captureJson(arg).text != null);
  return cleaned.length ? captureJson(cleaned).text : undefined;
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
        const capturedOutput = captureJson(result);
        const output = capturedOutput.text;
        _store?.pushSpan({
          spanId,
          traceId,
          parentSpanId,
          name,
          startedAt: startMs,
          durationMs: Date.now() - startMs,
          inputSize: input?.length ?? 0,
          outputSize: capturedOutput.size ?? 0,
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
