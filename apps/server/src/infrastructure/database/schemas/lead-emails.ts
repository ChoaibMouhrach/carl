import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import {
  leadEmailSources,
  leadEmailStatuses,
  leadEmailVerifications,
} from "@repo/constants/lead-emails";
import { id, timestamps } from "../utils";
import { leadsTable } from "./leads";

export const leadEmailsTable = pgTable(
  "lead_emails",
  {
    emailId: id(),

    // -- relations
    leadId: integer()
      .notNull()
      .references(() => leadsTable.leadId, { onDelete: "cascade" }),

    // -- fields
    address: text().notNull(),
    source: text({ enum: leadEmailSources }).notNull(),
    status: text({ enum: leadEmailStatuses }),
    verification: text({ enum: leadEmailVerifications }),
    verifiedAt: timestamp(),

    // -- timestamps
    ...timestamps(),
  },
  (table) => [
    unique("lead_emails_lead_address_unique").on(table.leadId, table.address),
    index("lead_emails_lead_source_idx").on(table.leadId, table.source),
  ],
);

export const leadEmailsRelations = relations(leadEmailsTable, ({ one }) => ({
  lead: one(leadsTable, {
    fields: [leadEmailsTable.leadId],
    references: [leadsTable.leadId],
  }),
}));

export type LeadEmailsTable = typeof leadEmailsTable;
export type LeadEmail = LeadEmailsTable["$inferSelect"];
