CREATE TABLE `network_link_segments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`linkId` int NOT NULL,
	`toNodeId` int NOT NULL,
	`toPortId` int,
	`toPortName` varchar(100),
	`routePoints` json,
	`color` varchar(20),
	`capacityBps` float,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `network_link_segments_id` PRIMARY KEY(`id`)
);
