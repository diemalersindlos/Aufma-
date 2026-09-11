CREATE TABLE `project_archives` (
	`project_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`archived_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `owner_email`)
);
--> statement-breakpoint
CREATE INDEX `project_archives_owner_date_idx` ON `project_archives` (`owner_email`,`archived_at`);