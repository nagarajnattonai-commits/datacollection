CREATE TABLE `workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`body` text NOT NULL
);
