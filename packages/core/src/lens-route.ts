import { randomUUID } from "node:crypto";
import type { Context, Env, Handler, Input } from "hono";
import { type Span, storage, type TraceContext } from "./context.js";
import type { TraceStore } from "./trace-store.js";

let _store: TraceStore | undefined;

export function configureLensRoute(store: TraceStore): void {
  _store = store;
}

export function lensRoute<E extends Env = Env, P extends string = string, I extends Input = Input>(
  name: string,
  handler: Handler<E, P, I>,
): Handler<E, P, I> {
  return (c: Context<E, P, I>, next) => {
    const spanId = randomUUID();
    const traceId = randomUUID();
    const startMs = Date.now();

    const span: Span = { spanId, parentSpanId: undefined, name, startMs };
    const ctx: TraceContext = { traceId, spanStack: [span] };

    return storage.run(ctx, async () => {
      try {
        const result = await handler(c, next);
        _store?.pushSpan({
          spanId,
          traceId,
          parentSpanId: undefined,
          name,
          startedAt: startMs,
          durationMs: Date.now() - startMs,
          inputSize: Number(c.req.header("content-length") ?? 0),
        });
        return result;
      } catch (err) {
        _store?.pushSpan({
          spanId,
          traceId,
          parentSpanId: undefined,
          name,
          startedAt: startMs,
          durationMs: Date.now() - startMs,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    });
  };
}
