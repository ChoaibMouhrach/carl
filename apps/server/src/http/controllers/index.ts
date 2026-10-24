import { Hono } from "hono";
import type { AppContext } from "@server/app";
import { platformSetupController } from "./platform-setup";
import { queueController } from "./queue";

export const controllers = new Hono<AppContext>()
  .route("/platform-setup", platformSetupController)
  .route("/queues", queueController);
