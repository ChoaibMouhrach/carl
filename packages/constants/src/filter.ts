export const assessmentVerdicts = [
  "qualified",
  "needs_review",
  "disqualified",
  "competitor",
] as const;

export type AssessmentVerdict = (typeof assessmentVerdicts)[number];

/** What a question means for the verdict: a requirement must be yes, a disqualifier removes the lead on yes, a competitor flag marks competitors on yes, a signal never changes the verdict and only counts towards the priority score */
export const questionRoles = [
  "requirement",
  "disqualifier",
  "competitor",
  "evidence",
  "signal",
] as const;

export type QuestionRole = (typeof questionRoles)[number];

export const unknownBehaviours = ["review", "disqualify"] as const;

export type UnknownBehaviour = (typeof unknownBehaviours)[number];

export const answerValues = ["yes", "no", "unknown"] as const;

export type AnswerValue = (typeof answerValues)[number];

export const maxFilterQuestions = 12;

export interface FilterQuestionInput {
  label: string;
  guidance: string;
  role: QuestionRole;
  onUnknown: UnknownBehaviour;
  enabled: boolean;
}

export const defaultFilterQuestions: FilterQuestionInput[] = [
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
