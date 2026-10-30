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
