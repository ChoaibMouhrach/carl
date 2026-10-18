import { pgTable, text } from "drizzle-orm/pg-core";
import { id, timestamps } from "../utils";

export const leadsTable = pgTable("leads", {
  leadId: id(),

  // -- identity
  skoolUsername: text().notNull().unique(),
  name: text().notNull(),
  firstName: text(),
  lastName: text(),

  // -- profile
  bio: text(),
  location: text(),

  // -- online presence
  website: text(),
  linkedinUrl: text(),
  facebookUrl: text(),
  instagramUrl: text(),
  twitterUrl: text(),
  youtubeUrl: text(),

  // -- timestamps
  ...timestamps(),
});

export type LeadsTable = typeof leadsTable;
export type Lead = LeadsTable["$inferSelect"];
export type LeadInsert = LeadsTable["$inferInsert"];
