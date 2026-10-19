export * from "@repo/constants/campaign";

export const leadStatusLabels = {
  pending: "Pending",
  running: "Running",
  done: "Done",
  failed: "Failed",
} as const;

export const campaignStatusLabels = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
} as const;
