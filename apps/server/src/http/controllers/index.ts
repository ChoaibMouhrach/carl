import { Hono } from "hono";
import type { AppContext } from "@server/app";
import { platformSetupController } from "./platform-setup";
import { storageController } from "./storage";
import { userController } from "./user";
import { billingController } from "./billing";
import { notificationController } from "./notification";
import { queueController } from "./queue";
import { accountController } from "./account";

export const controllers = new Hono<AppContext>()
  .route("/account", accountController)
  .route("/platform-setup", platformSetupController)
  .route("/storage", storageController)
  .route("/billing", billingController)
  .route("/notifications", notificationController)
  .route("/users", userController)
  .route("/queues", queueController);
