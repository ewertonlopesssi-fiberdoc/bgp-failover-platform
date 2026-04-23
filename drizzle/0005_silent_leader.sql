ALTER TABLE `linux_destinations` MODIFY COLUMN `offlineAlert` enum('never','1','2','3','5') NOT NULL DEFAULT 'never';--> statement-breakpoint
ALTER TABLE `linux_destinations` ADD `latencyThreshold` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `linux_destinations` ADD `lossThreshold` int DEFAULT 0 NOT NULL;