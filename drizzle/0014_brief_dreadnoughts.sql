CREATE TABLE `customer_access_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`nodeId` int NOT NULL,
	`portId` int,
	`portName` varchar(100),
	`linkType` enum('fiber','radio','copper','vpn') NOT NULL DEFAULT 'fiber',
	`capacityBps` float,
	`useRoadRoute` boolean NOT NULL DEFAULT true,
	`routePoints` json,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_access_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `map_customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`address` text,
	`lat` float,
	`lng` float,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `map_customers_id` PRIMARY KEY(`id`)
);
