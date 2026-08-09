CREATE TABLE `job_postings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_user_id` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`location` text DEFAULT 'Location not listed' NOT NULL,
	`source` text NOT NULL,
	`direct_url` text NOT NULL,
	`apply_url` text,
	`description` text DEFAULT '' NOT NULL,
	`posted_at` text,
	`remote_status` text,
	`experience` text,
	`salary` text,
	`skills_json` text DEFAULT '[]' NOT NULL,
	`fit_score` integer,
	`fit_summary` text,
	`skill_gaps` text,
	`portfolio_projects` text,
	`search_query` text DEFAULT '' NOT NULL,
	`captured_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`synced_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_postings_owner_external_idx` ON `job_postings` (`owner_user_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scrape_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_user_id` text NOT NULL,
	`provider` text NOT NULL,
	`keywords` text NOT NULL,
	`location` text NOT NULL,
	`time_window` text NOT NULL,
	`result_count` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`owner_user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`keywords_json` text DEFAULT '["Software engineer"]' NOT NULL,
	`locations_json` text DEFAULT '["United States"]' NOT NULL,
	`selected_sources_json` text DEFAULT '["google_jobs","greenhouse"]' NOT NULL,
	`digest_enabled` integer DEFAULT false NOT NULL,
	`digest_hour` text DEFAULT '08:00' NOT NULL,
	`spreadsheet_id` text,
	`google_refresh_token` text,
	`google_access_token` text,
	`google_access_expires_at` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
