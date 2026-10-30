export const campaignPipelineSteps = [
  "scrape",
  "tavily",
  "website",
  "fullenrich",
] as const;

export type CampaignPipelineStep = (typeof campaignPipelineSteps)[number];
