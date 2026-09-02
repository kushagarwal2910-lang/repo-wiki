CREATE TABLE `chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`source_id` text,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_chunks_workspace_id` ON `chunks` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sources_workspace_id` ON `sources` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`brief` text NOT NULL,
	`created_at` text NOT NULL
);
