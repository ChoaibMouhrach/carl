import { relations } from "drizzle-orm";
import { boolean, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { id, timestamps } from "../utils";
import { leadsTable } from "./leads";

export const communitiesTable = pgTable(
  "communities",
  {
    communityId: id(),

    // -- relations
    leadId: integer()
      .notNull()
      .references(() => leadsTable.leadId, { onDelete: "cascade" }),

    // -- fields
    name: text().notNull(),
    skoolUrl: text().notNull().unique(),
    description: text(),
    members: integer(),
    mrr: integer(),
    email: text(),
    isFree: boolean().notNull(),
    priceCents: integer(),
    priceCurrency: text(),
    priceInterval: text({ enum: ["month", "year", "one_time"] }),

    // -- timestamps
    ...timestamps(),
  },
  (table) => [index("communities_lead_id_idx").on(table.leadId)],
);

export const communitiesRelations = relations(communitiesTable, ({ one }) => ({
  lead: one(leadsTable, {
    fields: [communitiesTable.leadId],
    references: [leadsTable.leadId],
  }),
}));

export type CommunitiesTable = typeof communitiesTable;
export type Community = CommunitiesTable["$inferSelect"];
export type CommunityInsert = CommunitiesTable["$inferInsert"];
