import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../utils";
import { campaignsTable } from "./campaigns";

export const pipelineSteps = ["scrape", "enrich"] as const;
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
