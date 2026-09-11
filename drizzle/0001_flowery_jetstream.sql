CREATE TABLE `project_versions` (
	`project_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`revision` integer NOT NULL,
	`status` text NOT NULL,
	`state_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `owner_email`, `revision`)
);
--> statement-breakpoint
CREATE INDEX `project_versions_owner_project_idx` ON `project_versions` (`owner_email`,`project_id`,`revision`);