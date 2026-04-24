CREATE TABLE `linux_incidents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`destinationId` int NOT NULL,
	`probeId` int NOT NULL,
	`type` enum('offline','latency','loss','both') NOT NULL,
	`startedAt` timestamp NOT NULL,
	`endedAt` timestamp,
	`avgLatencyMs` float NOT NULL DEFAULT 0,
	`avgLoss` float NOT NULL DEFAULT 0,
	`maxLatencyMs` float NOT NULL DEFAULT 0,
	`maxLoss` float NOT NULL DEFAULT 0,
	`resolved` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `linux_incidents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `linux_destinations` ADD `alertRepeatMinutes` int DEFAULT 5 NOT NULL;