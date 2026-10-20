import type { FilterQuestionInput } from "@repo/constants/filter";

export const sampleFilterQuestions: FilterQuestionInput[] = [
  {
    label: "Is this a commercial business?",
    guidance:
      "Paid memberships, coaching, courses, consulting, services, or other monetization. If no paid offer is visible, answer unknown rather than no.",
    role: "requirement",
    onUnknown: "review",
    enabled: true,
  },
  {
    label: "Is the owner a potential buyer?",
    guidance:
      "Founder, business owner, operator, or someone likely to make purchasing decisions.",
    role: "requirement",
    onUnknown: "review",
    enabled: true,
  },
  {
    label: "Are there repeatable workflows?",
    guidance:
      "Onboarding, scheduling, follow-ups, support, reporting, member management, etc.",
    role: "signal",
    onUnknown: "review",
    enabled: true,
  },
  {
    label: "Does the business operate beyond Skool?",
    guidance:
      "External websites, booking systems, CRMs, payment systems, applications, or additional services.",
    role: "signal",
    onUnknown: "review",
    enabled: true,
  },
  {
    label: "Are they a direct competitor?",
    guidance:
      "Do they sell AI automation or workflow implementation as a service? Teaching AI alone does not count.",
    role: "competitor",
    onUnknown: "review",
    enabled: true,
  },
  {
    label: "Is there enough evidence?",
    guidance:
      "Can the answers be supported with actual information from the lead's data rather than assumptions?",
    role: "evidence",
    onUnknown: "review",
    enabled: true,
  },
];
