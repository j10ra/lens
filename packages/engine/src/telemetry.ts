import type { Db } from "./db/connection";
import { telemetryQueries } from "./db/queries";

let _enabled = true;

export function setTelemetryEnabled(enabled: boolean): void {
  _enabled = enabled;
}

export function track(db: Db, eventType: string, data?: Record<string, unknown>): void {
  if (!_enabled) return;
  try {
    telemetryQueries.insert(db, eventType, data);
  } catch {}
}
