import type {
  LeadEmailSource,
  LeadEmailStatus,
  LeadEmailVerification,
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

export const leadEmailVerificationLabels: Record<
  LeadEmailVerification,
  string
> = {
  valid: "Verified",
  risky: "Risky",
  invalid: "Invalid",
  unknown: "Unknown",
};

export const leadEmailVerificationVariants: Record<
  LeadEmailVerification,
  "default" | "secondary" | "destructive" | "outline"
> = {
  valid: "default",
  risky: "secondary",
  invalid: "destructive",
  unknown: "outline",
};
