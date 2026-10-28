import z from "zod";

export const pipelineStepSchema = z.enum([
  "scrape",
  "tavily",
  "ai-filter",
  "accepted",
]);

export type PipelineStepId = z.infer<typeof pipelineStepSchema>;

export type StepStatus = "idle" | "running" | "done" | "failed";

export const runStatus = (run: { status: StepStatus } | null): StepStatus =>
  run?.status ?? "idle";
