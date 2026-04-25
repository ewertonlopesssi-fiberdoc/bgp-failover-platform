ALTER TABLE `network_links` ADD `useRoadRoute` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `network_links` ADD `routePoints` json;