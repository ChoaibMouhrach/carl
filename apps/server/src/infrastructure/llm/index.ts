import type { ENV } from "@server/config/env";
import type { BaseLlm } from "@server/lib/base-llm";
import { createOpenAiLlm } from "./ai-sdk";

/** Picks the strategy once: the Vercel AI SDK with OpenAI */
export const createLlm = (env: ENV): BaseLlm =>
  createOpenAiLlm({
    apiKey: env.OPENAI_API_KEY,
    model: env.AI_FILTER_MODEL,
  });
