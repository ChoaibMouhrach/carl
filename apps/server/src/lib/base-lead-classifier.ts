import type { AnswerValue, QuestionRole } from "@repo/constants/filter";

export interface ClassifierQuestion {
  questionId: number;
  label: string;
  guidance: string;
  role: QuestionRole;
}

export interface ClassifierInput {
  /** What the campaign is trying to do: who we are, what we offer and what a good lead looks like */
  context: string | null;
  questions: ClassifierQuestion[];
  /** Plain text of everything we hold about the lead: the only thing the AI may use */
  facts: string;
  leadUsername: string;
}

export interface ClassifiedAnswer {
  questionId: number;
  answer: AnswerValue;
  /** A quote copied from the facts that backs a yes */
  evidence: string | null;
}

export interface ClassifierOutput {
  answers: ClassifiedAnswer[];
  summary: string;
  model: string;
}

export abstract class BaseLeadClassifier {
  public abstract readonly provider: string;
  public abstract readonly model: string;

  public abstract classify(input: ClassifierInput): Promise<ClassifierOutput>;
}
