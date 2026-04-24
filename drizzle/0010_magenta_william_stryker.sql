CREATE TABLE `latency_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`portId` int NOT NULL,
	`latencyMs` float,
	`status` varchar(20) NOT NULL DEFAULT 'ok',
	`measuredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `latency_history_id` PRIMARY KEY(`id`)
);
