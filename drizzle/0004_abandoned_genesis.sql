CREATE TABLE `linux_dest_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`destinationId` int NOT NULL,
	`probeId` int NOT NULL,
	`latencyMs` float NOT NULL,
	`packetLoss` float NOT NULL DEFAULT 0,
	`measuredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `linux_dest_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `linux_destinations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`probeId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`host` varchar(255) NOT NULL,
	`packetSize` int NOT NULL DEFAULT 32,
	`packetCount` int NOT NULL DEFAULT 5,
	`frequency` int NOT NULL DEFAULT 30,
	`offlineAlert` enum('never','always','threshold') NOT NULL DEFAULT 'threshold',
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `linux_destinations_id` PRIMARY KEY(`id`)
);
