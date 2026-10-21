import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output, type LanguageModel } from "ai";
import {
  BaseLlm,
  type StructuredRequest,
  type StructuredResult,
} from "@server/lib/base-llm";

const MAX_RETRIES = 2;

interface AiSdkLlmInit {
  languageModel: LanguageModel;
  model: string;
  provider: string;
}

/** The Vercel AI SDK strategy */
export class AiSdkLlm extends BaseLlm {
  public readonly model: string;
  public readonly provider: string;

  private languageModel: LanguageModel;

  public constructor(init: AiSdkLlmInit) {
    super();

    this.languageModel = init.languageModel;
    this.model = init.model;
    this.provider = init.provider;
  }

  public override async generateStructured<Output>(
    request: StructuredRequest<Output>,
  ): Promise<StructuredResult<Output>> {
    const { output, usage } = await generateText({
      model: this.languageModel,
      system: request.system,
      prompt: request.prompt,
      maxRetries: MAX_RETRIES,
      output: Output.object({ schema: request.schema }),
    });

    return {
      output,
      usage: {
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
      },
    };
  }
}

export const createOpenAiLlm = (init: { apiKey: string; model: string }) =>
  new AiSdkLlm({
    provider: "openai",
    model: init.model,
    languageModel: createOpenAI({ apiKey: init.apiKey })(init.model),
  });
