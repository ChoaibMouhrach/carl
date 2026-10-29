export const campaignPipelineSteps = [
  "scrape",
  "tavily",
  "fullenrich",
] as const;

export type CampaignPipelineStep = (typeof campaignPipelineSteps)[number];
