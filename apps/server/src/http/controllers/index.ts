import { Hono } from "hono";
import type { AppContext } from "@server/app";
import { platformSetupController } from "./platform-setup";
import { queueController } from "./queue";
import { leadController } from "./lead";
import { communityController } from "./community";
import { campaignController } from "./campaign";

export const controllers = new Hono<AppContext>()
  .route("/platform-setup", platformSetupController)
  .route("/queues", queueController)
  .route("/leads", leadController)
  .route("/communities", communityController)
  .route("/campaigns", campaignController);
