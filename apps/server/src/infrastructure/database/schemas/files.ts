import { bigint, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { id, timestamps } from "../utils";
import { userTable } from "./auth";

export const filesTable = pgTable("files", {
  fileId: id(),

  // -- fields
  name: text().notNull(),
  sizeBytes: bigint({ mode: "number" }).notNull(),
  mimeType: text().notNull(),
  metaData: jsonb(),
  url: text().notNull(),
  key: text().notNull(),
  userId: text()
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),

  // -- timestamps
  ...timestamps(),
});

export type FilesTable = typeof filesTable;
export type File = FilesTable["$inferSelect"];
export type FileInsert = FilesTable["$inferInsert"];
