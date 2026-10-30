import type { LeadEmailSource } from "@repo/constants/lead-emails";

export const leadEmailSourceLabels: Record<LeadEmailSource, string> = {
  skool: "Skool",
  tavily: "Tavily",
  website: "Website",
  "fullenrich-work": "Work",
  "fullenrich-personal": "Personal",
  manual: "Added",
  unknown: "Found",
};
