import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { id, timestamps } from "../utils";
import { communitiesTable } from "./communities";

export const leadsTable = pgTable("leads", {
  leadId: id(),

  // -- fields
  name: text().notNull(),
  username: text().notNull().unique(),
  skoolUrl: text().notNull().unique(),
  bio: text(),
  instagram: text(),
  facebook: text(),
  linkedin: text(),
  website: text(),
  email: text(),
  pictureUrl: text(),
  enrichedAt: timestamp(),
  workEmail: text(),
  personalEmail: text(),
  emailEnrichedAt: timestamp(),

  // -- timestamps
  ...timestamps(),
});

export const leadsRelations = relations(leadsTable, ({ many }) => ({
  communities: many(communitiesTable),
}));

export type LeadsTable = typeof leadsTable;
export type Lead = LeadsTable["$inferSelect"];
export type LeadInsert = LeadsTable["$inferInsert"];
