import type { BaseLlm } from "@server/lib/base-llm";
import {
  BaseLeadClassifier,
  type ClassifierInput,
  type ClassifierOutput,
} from "@server/lib/base-lead-classifier";
import { classifierAnswerSchema } from "@server/lib/classifier-schema";
import {
  buildClassifierPrompt,
  classifierInstructions,
} from "@server/lib/classifier-prompt";

interface LlmLeadClassifierInit {
  llm: BaseLlm;
}

/** Classifies a lead by asking whichever LLM strategy it is given */
export class LlmLeadClassifier extends BaseLeadClassifier {
  private llm: BaseLlm;

  public constructor(init: LlmLeadClassifierInit) {
    super();

    this.llm = init.llm;
  }

  public get provider() {
    return this.llm.provider;
  }

  public get model() {
    return this.llm.model;
  }

  public override async classify(
    input: ClassifierInput,
  ): Promise<ClassifierOutput> {
    const { output } = await this.llm.generateStructured({
      system: classifierInstructions,
      prompt: buildClassifierPrompt(input),
      schema: classifierAnswerSchema,
    });

    return {
      answers: output.answers.map((answer) => ({
        questionId: answer.questionId,
        answer: answer.answer,
        evidence: answer.evidence || null,
      })),
      summary: output.summary,
      model: this.llm.model,
    };
  }
}
