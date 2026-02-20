import { randomUUID } from "node:crypto";
import type { Context, Env, Handler, Input } from "hono";
import { type Span, storage, type TraceContext } from "./context.js";
import type { TraceStore } from "./trace-store.js";

let _store: TraceStore | undefined;

const MAX_CAPTURE = 262_144; // cap payload capture at 256KB

export function configureLensRoute(store: TraceStore): void {
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
      let inputSize: number | undefined;
      const contentType = c.req.header("content-type") ?? "";
      if (contentType.includes("json") && ["POST", "PUT", "PATCH"].includes(c.req.method)) {
        try {
          const body = await c.req.json();
          const captured = captureJson(body);
          input = captured.text;
          inputSize = captured.size;
        } catch {
          // no body or not parseable
        }
      }

      try {
        const result = await handler(c, next);

        // Capture response body from the Response object
        let output: string | undefined;
        let outputSize = 0;
        if (result instanceof Response) {
          try {
            const cloned = result.clone();
            const responseBody = await cloned.json();
            const captured = captureJson(responseBody);
            output = captured.text;
            outputSize = captured.size ?? 0;
          } catch {
            // non-JSON response
          }
        }

        const contentLength = Number(c.req.header("content-length") ?? 0);
        const resolvedInputSize = inputSize ?? (Number.isFinite(contentLength) ? contentLength : 0);
        _store?.pushSpan({
          spanId,
          traceId,
          parentSpanId: undefined,
          name,
          startedAt: startMs,
          durationMs: Date.now() - startMs,
          inputSize: resolvedInputSize,
          outputSize,
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
