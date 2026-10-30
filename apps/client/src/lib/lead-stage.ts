import { leadStages, type LeadStage } from "@repo/constants/pipeline";

export const leadStageLabels: Record<LeadStage, string> = {
  unresearched: "Not researched",
  researched: "Researched",
  contactable: "Contactable",
  withEmail: "Has email",
  needsEmail: "Needs email",
};

export const leadStageOptions: { value: LeadStage | "any"; label: string }[] = [
  { value: "any", label: "Any stage" },
  ...leadStages.map((stage) => ({
    value: stage,
    label: leadStageLabels[stage],
  })),
];
