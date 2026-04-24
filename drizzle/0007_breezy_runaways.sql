CREATE TABLE `interface_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`portId` int NOT NULL,
	`ifName` varchar(100) NOT NULL,
	`label` varchar(150) NOT NULL,
	`category` enum('upstream','dedicated') NOT NULL DEFAULT 'dedicated',
	`contractedBps` float NOT NULL DEFAULT 0,
	`alertThreshold` int NOT NULL DEFAULT 80,
	`alertEnabled` boolean NOT NULL DEFAULT false,
	`lastAlertAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `interface_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `interface_configs_portId_unique` UNIQUE(`portId`)
);
