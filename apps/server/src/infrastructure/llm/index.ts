import type { ENV } from "@server/config/env";
import type { BaseLlm } from "@server/lib/base-llm";
import { createOpenAiLlm } from "./ai-sdk";
import { DisabledLlm } from "./disabled";

/** Picks the strategy once: the Vercel AI SDK with OpenAI, or a disabled one without a key */
export const createLlm = (env: ENV): BaseLlm => {
  if (!env.OPENAI_API_KEY) {
    return new DisabledLlm({ provider: "openai", model: env.AI_FILTER_MODEL });
  }

  return createOpenAiLlm({
    apiKey: env.OPENAI_API_KEY,
    model: env.AI_FILTER_MODEL,
  });
};
