ALTER TABLE `telegram_config` ADD `latencyThreshold` int DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `telegram_config` ADD `packetLossThreshold` float DEFAULT 5 NOT NULL;