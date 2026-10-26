import { Hono } from "hono";
import type { AppContext } from "@server/app";
import { platformSetupController } from "./platform-setup";
import { queueController } from "./queue";
import { scrapeController } from "./scrape";
import { leadController } from "./leads";
import { communityController } from "./communities";

export const controllers = new Hono<AppContext>()
  .route("/platform-setup", platformSetupController)
  .route("/queues", queueController)
  .route("/scrape", scrapeController)
  .route("/leads", leadController)
  .route("/communities", communityController);
