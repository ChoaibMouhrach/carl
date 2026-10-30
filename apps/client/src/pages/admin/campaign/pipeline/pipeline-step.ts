export type StepStatus = "idle" | "running" | "done" | "failed";

export const runStatus = (run: { status: StepStatus } | null): StepStatus =>
  run?.status ?? "idle";
