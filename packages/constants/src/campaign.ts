export const stageNumbers = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type StageNumber = (typeof stageNumbers)[number];

export const campaignStatuses = [
  "draft",
  "active",
  "paused",
  "completed",
] as const;

export type CampaignStatus = (typeof campaignStatuses)[number];

export const leadStatuses = ["pending", "running", "done", "failed"] as const;

export type LeadStatus = (typeof leadStatuses)[number];

export const skoolVisibilities = ["public", "private"] as const;

export type SkoolVisibility = (typeof skoolVisibilities)[number];

export const skoolPriceFilters = ["free", "paid", "free-trial"] as const;

export type SkoolPriceFilter = (typeof skoolPriceFilters)[number];
