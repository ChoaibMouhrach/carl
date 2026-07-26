import { jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { notificationTypes } from "@repo/constants/notifications";
import { id, timestamps } from "../utils";
import { userTable } from "./auth";

export const notificationTypesEnum = pgEnum(
  "notificationTypes",
  notificationTypes,
);

export const notificationsTable = pgTable("notifications", {
  notificationId: id(),
  userId: text()
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  type: notificationTypesEnum().notNull(),
  title: text().notNull(),
  body: text().notNull(),
  data: jsonb().notNull().default({}),
  readAt: timestamp(),
  ...timestamps(),
});
