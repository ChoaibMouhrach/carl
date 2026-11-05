import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../utils";
import { communitiesTable } from "./communities";
import { leadsTable } from "./leads";

export const leadActivitiesTable = pgTable(
  "lead_activities",
  {
    activityId: id(),

    // -- relations
    leadId: integer()
      .notNull()
      .references(() => leadsTable.leadId, { onDelete: "cascade" }),
    communityId: integer()
      .notNull()
      .references(() => communitiesTable.communityId, { onDelete: "cascade" }),

    // -- fields
    skoolId: text().notNull(),
    kind: text({ enum: ["post", "comment"] }).notNull(),
    rootPostId: text().notNull(),
    // The lead's own post title, or the title of the post the lead commented on
    postTitle: text().notNull(),
    content: text().notNull(),
    postedAt: timestamp().notNull(),

    // -- timestamps
    ...timestamps(),
  },
  (table) => [
    unique("lead_activities_community_skool_unique").on(
      table.communityId,
      table.skoolId,
    ),
    index("lead_activities_community_posted_idx").on(
      table.communityId,
      table.postedAt,
    ),
    index("lead_activities_lead_idx").on(table.leadId),
  ],
);

export const leadActivitiesRelations = relations(
  leadActivitiesTable,
  ({ one }) => ({
    lead: one(leadsTable, {
      fields: [leadActivitiesTable.leadId],
      references: [leadsTable.leadId],
    }),
    community: one(communitiesTable, {
      fields: [leadActivitiesTable.communityId],
      references: [communitiesTable.communityId],
    }),
  }),
);

export type LeadActivitiesTable = typeof leadActivitiesTable;
export type LeadActivity = LeadActivitiesTable["$inferSelect"];
export type LeadActivityInsert = LeadActivitiesTable["$inferInsert"];
