CREATE TABLE `linux_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`probeId` int NOT NULL,
	`operatorId` int NOT NULL,
	`destinationId` int NOT NULL,
	`latencyMs` float NOT NULL,
	`packetLoss` float NOT NULL DEFAULT 0,
	`measuredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `linux_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `linux_probes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operatorId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`sourceIp` varchar(45) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `linux_probes_id` PRIMARY KEY(`id`)
);
