import type {
  LeadEmailSource,
  LeadEmailStatus,
} from "@repo/constants/lead-emails";

export const leadEmailSourceLabels: Record<LeadEmailSource, string> = {
  skool: "Skool",
  tavily: "Tavily",
  website: "Website",
  "fullenrich-work": "Work",
  "fullenrich-personal": "Personal",
  manual: "Added",
  unknown: "Found",
};

export const leadEmailStatusLabels: Record<LeadEmailStatus, string> = {
  deliverable: "Deliverable",
  highProbability: "Likely valid",
  catchAll: "Catch-all",
  unknown: "Unverified",
};

export const leadEmailStatusVariants: Record<
  LeadEmailStatus,
  "default" | "secondary" | "outline"
> = {
  deliverable: "default",
  highProbability: "secondary",
  catchAll: "outline",
  unknown: "outline",
};
