CREATE TABLE `logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trace_id` text,
	`span_id` text,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spans` (
	`span_id` text PRIMARY KEY NOT NULL,
	`trace_id` text NOT NULL,
	`parent_span_id` text,
	`name` text NOT NULL,
	`started_at` integer NOT NULL,
	`duration_ms` real,
	`error_message` text,
	`input_size` integer,
	`output_size` integer,
	FOREIGN KEY (`trace_id`) REFERENCES `traces`(`trace_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `traces` (
	`trace_id` text PRIMARY KEY NOT NULL,
	`root_span_name` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_ms` real
);
