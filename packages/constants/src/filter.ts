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
