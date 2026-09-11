CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`title` text NOT NULL,
	`customer` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`file_name` text DEFAULT '' NOT NULL,
	`page_count` integer DEFAULT 0 NOT NULL,
	`position_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`state_json` text NOT NULL,
	`pdf_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_owner_updated_idx` ON `projects` (`owner_email`,`updated_at`);