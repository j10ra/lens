import { randomUUID } from "node:crypto";
import type { Context, Env, Handler, Input } from "hono";
import { type Span, storage, type TraceContext } from "./context.js";
import type { TraceStore } from "./trace-store.js";

let _store: TraceStore | undefined;

const MAX_CAPTURE = 8_192; // cap payload capture at 8KB

export function configureLensRoute(store: TraceStore): void {
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

export function lensRoute<E extends Env = Env, P extends string = string, I extends Input = Input>(
  name: string,
  handler: Handler<E, P, I>,
): Handler<E, P, I> {
  return (c: Context<E, P, I>, next) => {
    const spanId = randomUUID();
    const traceId = randomUUID();
    const startMs = Date.now();
    const source = (c.req.header("x-lens-source") as string) ?? "unknown";

    const span: Span = { spanId, parentSpanId: undefined, name, startMs };
    const ctx: TraceContext = { traceId, spanStack: [span] };

    return storage.run(ctx, async () => {
      // Capture request body (only for POST/PUT/PATCH with JSON)
      let input: string | undefined;
      const contentType = c.req.header("content-type") ?? "";
      if (contentType.includes("json") && ["POST", "PUT", "PATCH"].includes(c.req.method)) {
        try {
          const body = await c.req.json();
          input = safeStringify(body);
        } catch {
          // no body or not parseable
        }
      }

      try {
        const result = await handler(c, next);

        // Capture response body from the Response object
        let output: string | undefined;
        if (result instanceof Response) {
          try {
            const cloned = result.clone();
            const responseBody = await cloned.json();
            output = safeStringify(responseBody);
          } catch {
            // non-JSON response
          }
        }

        const inputSize = input?.length ?? Number(c.req.header("content-length") ?? 0);
        _store?.pushSpan({
          spanId,
          traceId,
          parentSpanId: undefined,
          name,
          startedAt: startMs,
          durationMs: Date.now() - startMs,
          inputSize,
          outputSize: output?.length ?? 0,
          input,
          output,
          source,
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
          input,
          source,
        });
        throw err;
      }
    });
  };
}
