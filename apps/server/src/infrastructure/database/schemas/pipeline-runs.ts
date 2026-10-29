import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  primaryKey,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../utils";
import { leadsTable } from "./leads";
import { campaignsTable } from "./campaigns";

export const pipelineSteps = ["scrape", "enrich", "fullenrich"] as const;
export const pipelineRunStatuses = ["running", "done", "failed"] as const;

export const pipelineRunsTable = pgTable(
  "pipeline_runs",
  {
    runId: id(),

    // -- relations
    campaignId: integer()
      .notNull()
      .references(() => campaignsTable.campaignId, { onDelete: "cascade" }),

    // -- fields
    step: text({ enum: pipelineSteps }).notNull(),
    status: text({ enum: pipelineRunStatuses }).notNull().default("running"),
    itemsReady: boolean().notNull().default(false),
    total: integer().notNull().default(0),
    processed: integer().notNull().default(0),
    failed: integer().notNull().default(0),
    error: text(),

    // -- timestamps
    ...timestamps(),
  },
  (table) => [
    index("pipeline_runs_campaign_step_idx").on(table.campaignId, table.step),
    uniqueIndex("pipeline_runs_one_running_idx")
      .on(table.campaignId, table.step)
      .where(sql`${table.status} = 'running'`),
  ],
);

export type PipelineRunsTable = typeof pipelineRunsTable;
export type PipelineRun = PipelineRunsTable["$inferSelect"];
export type PipelineRunInsert = PipelineRunsTable["$inferInsert"];
export type PipelineStep = (typeof pipelineSteps)[number];

export const pipelineItemsTable = pgTable(
  "pipeline_items",
  {
    runId: integer()
      .notNull()
      .references(() => pipelineRunsTable.runId, { onDelete: "cascade" }),
    itemKey: text().notNull(),
    leadId: integer().references(() => leadsTable.leadId, {
      onDelete: "set null",
    }),
    status: text({ enum: ["pending", "processed", "failed"] })
      .notNull()
      .default("pending"),
    website: text(),
    linkedin: text(),
    email: text(),
    workEmail: text(),
    personalEmail: text(),
    error: text(),
    ...timestamps(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.itemKey] }),
    index("pipeline_items_run_lead_idx").on(table.runId, table.leadId),
  ],
);

export type PipelineItem = typeof pipelineItemsTable.$inferSelect;
export type PipelineItemInsert = typeof pipelineItemsTable.$inferInsert;
