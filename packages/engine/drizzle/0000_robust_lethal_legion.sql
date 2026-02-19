CREATE TABLE `chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`path` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`start_line` integer NOT NULL,
	`end_line` integer NOT NULL,
	`content` text NOT NULL,
	`chunk_hash` text NOT NULL,
	`last_seen_commit` text NOT NULL,
	`language` text,
	FOREIGN KEY (`repo_id`) REFERENCES `repos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chunks_unique` ON `chunks` (`repo_id`,`path`,`chunk_index`,`chunk_hash`);--> statement-breakpoint
CREATE INDEX `idx_chunks_repo_path` ON `chunks` (`repo_id`,`path`);--> statement-breakpoint
CREATE TABLE `file_cochanges` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`path_a` text NOT NULL,
	`path_b` text NOT NULL,
	`cochange_count` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_file_cochanges_unique` ON `file_cochanges` (`repo_id`,`path_a`,`path_b`);--> statement-breakpoint
CREATE INDEX `idx_cochanges_lookup` ON `file_cochanges` (`repo_id`,`path_a`);--> statement-breakpoint
CREATE TABLE `file_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`source_path` text NOT NULL,
	`target_path` text NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_file_imports_unique` ON `file_imports` (`repo_id`,`source_path`,`target_path`);--> statement-breakpoint
CREATE INDEX `idx_file_imports_target` ON `file_imports` (`repo_id`,`target_path`);--> statement-breakpoint
CREATE INDEX `idx_file_imports_source` ON `file_imports` (`repo_id`,`source_path`);--> statement-breakpoint
CREATE TABLE `file_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`path` text NOT NULL,
	`language` text,
	`exports` text DEFAULT '[]',
	`imports` text DEFAULT '[]',
	`docstring` text DEFAULT '',
	`sections` text DEFAULT '[]',
	`internals` text DEFAULT '[]',
	FOREIGN KEY (`repo_id`) REFERENCES `repos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_file_metadata_unique` ON `file_metadata` (`repo_id`,`path`);--> statement-breakpoint
CREATE TABLE `file_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`path` text NOT NULL,
	`commit_count` integer DEFAULT 0 NOT NULL,
	`recent_count` integer DEFAULT 0 NOT NULL,
	`last_modified` text,
	FOREIGN KEY (`repo_id`) REFERENCES `repos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_file_stats_unique` ON `file_stats` (`repo_id`,`path`);--> statement-breakpoint
CREATE TABLE `repos` (
	`id` text PRIMARY KEY NOT NULL,
	`identity_key` text NOT NULL,
	`name` text NOT NULL,
	`root_path` text NOT NULL,
	`remote_url` text,
	`last_indexed_commit` text,
	`index_status` text DEFAULT 'pending' NOT NULL,
	`last_indexed_at` text,
	`last_git_analysis_commit` text,
	`max_import_depth` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repos_identity_key_unique` ON `repos` (`identity_key`);--> statement-breakpoint
CREATE INDEX `idx_repos_identity` ON `repos` (`identity_key`);