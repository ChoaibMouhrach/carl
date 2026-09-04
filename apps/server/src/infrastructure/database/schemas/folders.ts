import { type AnyPgColumn, integer, pgTable, text } from "drizzle-orm/pg-core";
import { id, timestamps } from "../utils";
import { userTable } from "./auth";
import { clientsTable } from "./clients";

export const foldersTable = pgTable("folders", {
  folderId: id(),
  clientId: integer()
    .notNull()
    .references(() => clientsTable.clientId, { onDelete: "cascade" }),
  userId: text()
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  parentId: integer().references((): AnyPgColumn => foldersTable.folderId, {
    onDelete: "cascade",
  }),
  name: text().notNull(),
  ...timestamps(),
});

export type FoldersTable = typeof foldersTable;
export type Folder = FoldersTable["$inferSelect"];
export type FolderInsert = FoldersTable["$inferInsert"];
