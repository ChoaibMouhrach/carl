import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { notificationTypes } from "@repo/constants/notifications";
import { id, timestamps } from "../utils";
import { usersTable } from "./user";

export const notificationTypesEnum = pgEnum(
  "notificationTypes",
  notificationTypes,
);

export const notificationsTable = pgTable("notifications", {
  notificationId: id(),
  userId: integer()
    .notNull()
    .references(() => usersTable.userId, { onDelete: "cascade" }),
  type: notificationTypesEnum().notNull(),
  title: text().notNull(),
  body: text().notNull(),
  data: jsonb().notNull().default({}),
  readAt: timestamp(),
  ...timestamps(),
});
