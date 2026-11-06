import { relations } from "drizzle-orm";
import { integer, pgTable, text, unique } from "drizzle-orm/pg-core";
import { id, timestamps } from "../utils";
import { leadsTable } from "./leads";

export const leadPagesTable = pgTable(
  "lead_pages",
  {
    pageId: id(),

    // -- relations
    leadId: integer()
      .notNull()
      .references(() => leadsTable.leadId, { onDelete: "cascade" }),

    // -- fields
    path: text().notNull(),
    url: text().notNull(),
    html: text().notNull(),

    // -- timestamps
    ...timestamps(),
  },
  (table) => [
    unique("lead_pages_lead_path_unique").on(table.leadId, table.path),
  ],
);

export const leadPagesRelations = relations(leadPagesTable, ({ one }) => ({
  lead: one(leadsTable, {
    fields: [leadPagesTable.leadId],
    references: [leadsTable.leadId],
  }),
}));

export type LeadPagesTable = typeof leadPagesTable;
export type LeadPage = LeadPagesTable["$inferSelect"];
export type LeadPageInsert = LeadPagesTable["$inferInsert"];
