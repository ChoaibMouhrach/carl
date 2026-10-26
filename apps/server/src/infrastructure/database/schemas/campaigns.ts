import { index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { id, timestamps } from "../utils";
import { communitiesTable } from "./communities";
import { leadsTable } from "./leads";

export const campaignsTable = pgTable("campaigns", {
  campaignId: id(),

  // -- fields
  name: text().notNull(),
  description: text(),
  keyword: text().notNull(),
  minPriceCents: integer(),
  minMembers: integer(),

  // -- timestamps
  ...timestamps(),
});

export const campaignLeadsTable = pgTable(
  "campaign_leads",
  {
    campaignId: integer()
      .notNull()
      .references(() => campaignsTable.campaignId, { onDelete: "cascade" }),
    leadId: integer()
      .notNull()
      .references(() => leadsTable.leadId, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.leadId] }),
    index("campaign_leads_lead_id_idx").on(table.leadId),
  ],
);

export const campaignCommunitiesTable = pgTable(
  "campaign_communities",
  {
    campaignId: integer()
      .notNull()
      .references(() => campaignsTable.campaignId, { onDelete: "cascade" }),
    communityId: integer()
      .notNull()
      .references(() => communitiesTable.communityId, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.communityId] }),
    index("campaign_communities_community_id_idx").on(table.communityId),
  ],
);

export type CampaignsTable = typeof campaignsTable;
export type Campaign = CampaignsTable["$inferSelect"];
export type CampaignInsert = CampaignsTable["$inferInsert"];
