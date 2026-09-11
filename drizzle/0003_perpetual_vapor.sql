CREATE TABLE `project_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`changes_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `project_audit_owner_project_date_idx` ON `project_audit_log` (`owner_email`,`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `project_trash` (
	`project_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`deleted_at` text NOT NULL,
	`delete_after` text NOT NULL,
	PRIMARY KEY(`project_id`, `owner_email`)
);
--> statement-breakpoint
CREATE INDEX `project_trash_owner_date_idx` ON `project_trash` (`owner_email`,`deleted_at`);