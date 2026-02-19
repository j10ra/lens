import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const traces = sqliteTable("traces", {
  traceId: text("trace_id").primaryKey(),
  rootSpanName: text("root_span_name").notNull(),
  startedAt: integer("started_at").notNull(), // Unix ms
  endedAt: integer("ended_at"),
  durationMs: real("duration_ms"),
});

export const spans = sqliteTable("spans", {
  spanId: text("span_id").primaryKey(),
  traceId: text("trace_id")
    .notNull()
    .references(() => traces.traceId, { onDelete: "cascade" }),
  parentSpanId: text("parent_span_id"),
  name: text("name").notNull(),
  startedAt: integer("started_at").notNull(),
  durationMs: real("duration_ms"),
  errorMessage: text("error_message"),
  inputSize: integer("input_size"),
  outputSize: integer("output_size"),
});

export const logs = sqliteTable("logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  traceId: text("trace_id"),
  spanId: text("span_id"),
  level: text("level", { enum: ["info", "warn", "error", "debug"] }).notNull(),
  message: text("message").notNull(),
  timestamp: integer("timestamp").notNull(),
});
