import { Hono } from "hono";
import type { AppContext } from "@server/app";
import { authController } from "./auth";
import { platformSetupController } from "./platform-setup";
import { storageController } from "./storage";
import { userController } from "./user";
import { billingController } from "./billing";
import { notificationController } from "./notification";

export const controllers = new Hono<AppContext>()
  .route("/auth", authController)
  .route("/platform-setup", platformSetupController)
  .route("/storage", storageController)
  .route("/billing", billingController)
  .route("/notifications", notificationController)
  .route("/users", userController);
