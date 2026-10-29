import z from "zod";
import { campaignPipelineSteps } from "@repo/constants/pipeline";

export const pipelineStepSchema = z.enum(campaignPipelineSteps);

export type PipelineStepId = z.infer<typeof pipelineStepSchema>;

export type StepStatus = "idle" | "running" | "done" | "failed";

export const runStatus = (run: { status: StepStatus } | null): StepStatus =>
  run?.status ?? "idle";
