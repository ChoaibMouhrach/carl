export const campaignPipelineSteps = [
  "scrape",
  "tavily",
  "ai-filter",
  "accepted",
] as const;

export type CampaignPipelineStep = (typeof campaignPipelineSteps)[number];
