CREATE TABLE `telegram_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_user_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`username` text,
	`display_name` text,
	`notifications_enabled` integer DEFAULT true NOT NULL,
	`linked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_links_owner_idx` ON `telegram_links` (`owner_user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_links_chat_idx` ON `telegram_links` (`chat_id`);
--> statement-breakpoint
CREATE TABLE `telegram_link_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer
);
