import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type {
  CampaignStatus,
  LeadStatus,
  SkoolPriceFilter,
  SkoolVisibility,
  StageNumber,
} from "@repo/constants/campaign";
import { id, timestamps } from "../utils";
import { leadsTable } from "./leads";

export type ScrapeRunStatus = "queued" | "running" | "completed" | "failed";

export type ScrapeRunSummary = {
  discovered: number;
  alreadyKnown: number;
  duplicatesInRun: number;
  communitiesCreated: number;
  leadsCreated: number;
  leadsReused: number;
  filteredOut?: number;
  leadsAttached: number;
  leadsRemoved?: number;
  failures: { target: string; reason: string }[];
};

export const campaignsTable = pgTable("campaigns", {
  campaignId: id(),
  name: text().notNull(),
  description: text(),
  status: text().$type<CampaignStatus>().notNull().default("draft"),

  // -- stage 1 (scrape) settings
  keyword: text().notNull(),
  types: jsonb().$type<SkoolVisibility[]>().notNull(),
  pricingModels: jsonb().$type<SkoolPriceFilter[]>().notNull(),
  minMonthlyPriceUsd: doublePrecision(),
  maxMonthlyPriceUsd: doublePrecision(),
  minMembers: integer(),
  maxMembers: integer(),

  ...timestamps(),
});

export const campaignLeadsTable = pgTable(
  "campaign_leads",
  {
    campaignLeadId: id(),
    campaignId: integer()
      .notNull()
      .references(() => campaignsTable.campaignId, { onDelete: "cascade" }),
    leadId: integer()
      .notNull()
      .references(() => leadsTable.leadId, { onDelete: "cascade" }),

    // -- pipeline position: the stage a lead last reached and how it went
    stage: integer().$type<StageNumber>().notNull().default(1),
    status: text().$type<LeadStatus>().notNull().default("pending"),
    failureReason: text(),
    /** The campaign keyword that first found the lead */
    keyword: text(),

    ...timestamps(),
  },
  (table) => [
    unique().on(table.campaignId, table.leadId),
    index().on(table.campaignId, table.stage, table.status),
  ],
);

export const scrapeRunsTable = pgTable(
  "scrape_runs",
  {
    scrapeRunId: id(),
    campaignId: integer()
      .notNull()
      .references(() => campaignsTable.campaignId, { onDelete: "cascade" }),
    status: text().$type<ScrapeRunStatus>().notNull().default("queued"),
    /** Drop stage 1 leads that this run does not find again */
    replace: boolean().notNull().default(false),
    summary: jsonb().$type<ScrapeRunSummary>(),
    error: text(),
    startedAt: timestamp(),
    finishedAt: timestamp(),

    ...timestamps(),
  },
  (table) => [index().on(table.campaignId, table.createdAt)],
);

export type CampaignsTable = typeof campaignsTable;
export type Campaign = CampaignsTable["$inferSelect"];
export type CampaignInsert = CampaignsTable["$inferInsert"];

export type CampaignLead = (typeof campaignLeadsTable)["$inferSelect"];
export type CampaignLeadInsert = (typeof campaignLeadsTable)["$inferInsert"];

export type ScrapeRun = (typeof scrapeRunsTable)["$inferSelect"];
