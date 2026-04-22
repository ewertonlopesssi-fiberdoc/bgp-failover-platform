CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('failover','recovery','config_change','alert','service','auth','info') NOT NULL,
	`severity` enum('info','warning','critical','success') NOT NULL DEFAULT 'info',
	`title` varchar(255) NOT NULL,
	`description` text,
	`metadata` json,
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `client_destinations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`host` varchar(255) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `client_destinations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `client_failover_state` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`activeOperatorId` int,
	`failoverActive` boolean NOT NULL DEFAULT false,
	`failoverReason` text,
	`failoverAt` timestamp,
	`recoveredAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_failover_state_id` PRIMARY KEY(`id`),
	CONSTRAINT `client_failover_state_clientId_unique` UNIQUE(`clientId`)
);
--> statement-breakpoint
CREATE TABLE `dedicated_clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`prefix` varchar(50) NOT NULL,
	`description` text,
	`failoverEnabled` boolean NOT NULL DEFAULT true,
	`latencyThreshold` int NOT NULL DEFAULT 100,
	`packetLossThreshold` float NOT NULL DEFAULT 5,
	`prependCount` int NOT NULL DEFAULT 3,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dedicated_clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `destinations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operatorId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`host` varchar(255) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `destinations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `latency_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operatorId` int NOT NULL,
	`destinationId` int NOT NULL,
	`latencyMs` float NOT NULL,
	`packetLoss` float NOT NULL DEFAULT 0,
	`jitterMs` float NOT NULL DEFAULT 0,
	`measuredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `latency_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `local_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`name` text,
	`email` varchar(320),
	`role` enum('admin','viewer') NOT NULL DEFAULT 'viewer',
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp,
	CONSTRAINT `local_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `local_users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `ne8000_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`host` varchar(255) NOT NULL,
	`port` int NOT NULL DEFAULT 22,
	`username` varchar(64) NOT NULL,
	`sshKeyPath` text,
	`password` text,
	`asNumber` varchar(20),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ne8000_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operators` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`interface` varchar(100) NOT NULL,
	`sourceIp` varchar(45) NOT NULL,
	`peerIp` varchar(45) NOT NULL,
	`asNumber` varchar(20),
	`active` boolean NOT NULL DEFAULT true,
	`status` enum('up','down','degraded','unknown') NOT NULL DEFAULT 'unknown',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operators_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `telegram_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`botToken` text,
	`chatId` varchar(100),
	`enabled` boolean NOT NULL DEFAULT false,
	`notifyFailover` boolean NOT NULL DEFAULT true,
	`notifyRecovery` boolean NOT NULL DEFAULT true,
	`notifyHighLatency` boolean NOT NULL DEFAULT true,
	`notifyBgpDown` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `telegram_config_id` PRIMARY KEY(`id`)
);
