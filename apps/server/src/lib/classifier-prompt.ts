import type { ClassifierInput } from "./base-lead-classifier";

export const classifierInstructions = `You assess a Skool community owner as a sales lead. You answer a list of questions about one lead.
The context under WHAT WE ARE TRYING TO DO tells you what a good lead means for us; use it only to understand the questions, never as proof about the lead.
Use ONLY the text provided under LEAD for facts about the lead. Never guess and never use outside knowledge. If the text does not clearly show the answer, answer "unknown".
Answer "yes", "no" or "unknown" for every question, using its questionId.
For every "yes", copy ONE short quote (at most 25 words) EXACTLY as written in the text as evidence. For "no" or "unknown" the evidence is an empty string.
Finish with a summary of one or two sentences that says why the lead fits or not.`;

/** The message the AI is sent about one lead; the same text is shown to the admin */
export const buildClassifierPrompt = (
  input: Pick<ClassifierInput, "context" | "questions" | "facts">,
) => {
  const questions = input.questions
    .map(
      (question) =>
        `- questionId ${question.questionId}: ${question.label}${question.guidance ? ` (${question.guidance})` : ""}`,
    )
    .join("\n");

  return `${input.context ? `WHAT WE ARE TRYING TO DO:\n${input.context}\n\n` : ""}QUESTIONS:\n${questions}\n\nLEAD:\n${input.facts}`;
};
