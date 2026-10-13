CREATE TABLE `qa_budget` (
	`id` integer PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`grant_id` text NOT NULL,
	`attempts` integer NOT NULL,
	`reserved_micro_usd` integer NOT NULL,
	`in_flight_request_id` text
);
--> statement-breakpoint
CREATE TABLE `qa_requests` (
	`request_id` text PRIMARY KEY NOT NULL,
	`user_hash` text NOT NULL,
	`grant_id` text NOT NULL,
	`report_sha` text NOT NULL,
	`asset_sha` text,
	`fixture` text,
	`mode` text,
	`advice_sha` text,
	`state` text NOT NULL,
	`reserve_micro_usd` integer NOT NULL,
	`applied` integer NOT NULL,
	`prompt_tokens` integer,
	`completion_tokens` integer
);
