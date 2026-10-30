export const leadStages = [
  "unresearched",
  "researched",
  "contactable",
  "withEmail",
  "needsEmail",
] as const;

export type LeadStage = (typeof leadStages)[number];
