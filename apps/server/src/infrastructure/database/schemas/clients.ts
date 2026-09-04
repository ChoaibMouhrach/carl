import { pgTable, text } from "drizzle-orm/pg-core";
import { id, timestamps } from "../utils";
import { userTable } from "./auth";

export const clientsTable = pgTable("clients", {
  clientId: id(),
  userId: text()
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  name: text().notNull(),
  email: text().notNull(),
  ...timestamps(),
});

export type ClientsTable = typeof clientsTable;
export type Client = ClientsTable["$inferSelect"];
export type ClientInsert = ClientsTable["$inferInsert"];
