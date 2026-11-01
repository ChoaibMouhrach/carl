export const leadEmailSources = [
  "skool",
  "tavily",
  "website",
  "fullenrich-work",
  "fullenrich-personal",
  "manual",
  "unknown",
] as const;

export type LeadEmailSource = (typeof leadEmailSources)[number];

export const leadEmailStatuses = [
  "deliverable",
  "highProbability",
  "catchAll",
  "unknown",
] as const;

export type LeadEmailStatus = (typeof leadEmailStatuses)[number];
