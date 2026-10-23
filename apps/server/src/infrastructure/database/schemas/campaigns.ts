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
  AnswerValue,
  AssessmentVerdict,
  QuestionRole,
  UnknownBehaviour,
} from "@repo/constants/filter";
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
  keywords: jsonb().$type<string[]>().notNull(),
  types: jsonb().$type<SkoolVisibility[]>().notNull(),
  pricingModels: jsonb().$type<SkoolPriceFilter[]>().notNull(),
  minMonthlyPriceUsd: doublePrecision(),
  maxMonthlyPriceUsd: doublePrecision(),
  minMembers: integer(),
  maxMembers: integer(),

  // -- stage 2 (ai filter) settings
  /** What the campaign is trying to do, given to the AI as background for judging fit */
  filterContext: text(),

  ...timestamps(),
});

export const campaignFilterQuestionsTable = pgTable(
  "campaign_filter_questions",
  {
    questionId: id(),
    campaignId: integer()
      .notNull()
      .references(() => campaignsTable.campaignId, { onDelete: "cascade" }),
    position: integer().notNull(),
    label: text().notNull(),
    guidance: text().notNull().default(""),
    role: text().$type<QuestionRole>().notNull(),
    onUnknown: text().$type<UnknownBehaviour>().notNull().default("review"),
    enabled: boolean().notNull().default(true),

    ...timestamps(),
  },
  (table) => [index().on(table.campaignId, table.position)],
);

export type AssessmentAnswer = {
  questionId: number;
  /** Kept as asked, so an assessment stays readable after the questions change */
  label: string;
  role: QuestionRole;
  answer: AnswerValue;
  evidence: string | null;
};

export const leadAssessmentsTable = pgTable(
  "lead_assessments",
  {
    leadAssessmentId: id(),
    campaignId: integer()
      .notNull()
      .references(() => campaignsTable.campaignId, { onDelete: "cascade" }),
    leadId: integer()
      .notNull()
      .references(() => leadsTable.leadId, { onDelete: "cascade" }),
    verdict: text().$type<AssessmentVerdict>().notNull(),
    summary: text().notNull(),
    answers: jsonb().$type<AssessmentAnswer[]>().notNull(),
    model: text().notNull(),

    ...timestamps(),
  },
  (table) => [unique().on(table.campaignId, table.leadId)],
);

export type CampaignFilterQuestion =
  (typeof campaignFilterQuestionsTable)["$inferSelect"];
export type LeadAssessment = (typeof leadAssessmentsTable)["$inferSelect"];

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
    /** Set while the lead is being run again on purpose, so a stage does not skip it for already having a result */
    rerun: boolean().notNull().default(false),
    /** The campaign keyword that first found the lead */
    keyword: text(),

    ...timestamps(),
  },
  (table) => [
    unique().on(table.campaignId, table.leadId),
    index().on(table.campaignId, table.stage, table.status),
  ],
);

export type EmailEnrichmentStatus = "waiting" | "finished" | "failed";

/** A batch of leads handed to the email finder, waiting for its answer */
export const emailEnrichmentsTable = pgTable(
  "email_enrichments",
  {
    emailEnrichmentId: id(),
    batchId: text().notNull().unique(),
    providerId: text(),
    campaignId: integer()
      .notNull()
      .references(() => campaignsTable.campaignId, { onDelete: "cascade" }),
    /** The lead ids behind each lookup sent, by the position it was sent in */
    groups: jsonb().$type<number[][]>().notNull(),
    status: text().$type<EmailEnrichmentStatus>().notNull().default("waiting"),
    failureReason: text(),
    finishedAt: timestamp(),

    ...timestamps(),
  },
  (table) => [index().on(table.status, table.createdAt)],
);

export type EmailEnrichment = (typeof emailEnrichmentsTable)["$inferSelect"];

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
