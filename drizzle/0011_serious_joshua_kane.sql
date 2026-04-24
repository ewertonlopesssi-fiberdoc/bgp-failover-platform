CREATE TABLE `network_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fromNodeId` int NOT NULL,
	`fromPortId` int,
	`fromPortName` varchar(100),
	`toNodeId` int NOT NULL,
	`toPortId` int,
	`toPortName` varchar(100),
	`linkType` enum('fiber','radio','copper','vpn') NOT NULL DEFAULT 'fiber',
	`capacityBps` float,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `network_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `network_nodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` int,
	`name` varchar(150) NOT NULL,
	`city` varchar(100),
	`lat` float,
	`lng` float,
	`nodeType` enum('router','switch','olt','server','pop') NOT NULL DEFAULT 'switch',
	`mgmtIp` varchar(45),
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `network_nodes_id` PRIMARY KEY(`id`)
);
