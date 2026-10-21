import { expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import { initENV } from "@server/config/env";
import { LlmLeadClassifier } from "@server/infrastructure/ai/llm-classifier";
import { AiSdkLlm } from "@server/infrastructure/llm/ai-sdk";
import { createLlm } from "@server/infrastructure/llm";
import {
  BaseLlm,
  type StructuredRequest,
  type StructuredResult,
} from "@server/lib/base-llm";
import type { ClassifierInput } from "@server/lib/base-lead-classifier";
import { classifierAnswerSchema } from "@server/lib/classifier-schema";
import {
  buildClassifierPrompt,
  classifierInstructions,
} from "@server/lib/classifier-prompt";

const input: ClassifierInput = {
  context: "We sell automation to coaches.",
  questions: [
    {
      questionId: 7,
      label: "Is it a business?",
      guidance: "Charges money.",
      role: "requirement",
    },
    {
      questionId: 8,
      label: "Is it a rival?",
      guidance: "",
      role: "competitor",
    },
  ],
  facts: "OWNER\nName: Jane\nBio: I run paid coaching.",
  leadUsername: "jane",
};

class FakeLlm extends BaseLlm {
  public provider = "fake-provider";
  public model = "fake-model";
  public requests: StructuredRequest<unknown>[] = [];
  public reply: unknown = { answers: [], summary: "" };
  public error: Error | null = null;

  public override async generateStructured<Output>(
    request: StructuredRequest<Output>,
  ): Promise<StructuredResult<Output>> {
    this.requests.push(request);

    if (this.error) throw this.error;

    return {
      output: request.schema.parse(this.reply),
      usage: { inputTokens: 10, outputTokens: 5 },
    };
  }
}

const modelReply = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: undefined },
  usage: {
    inputTokens: {
      total: 120,
      noCache: 120,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: 40, text: 40, reasoning: undefined },
  },
  warnings: [],
});

const answerText = JSON.stringify({
  answers: [{ questionId: 7, answer: "yes", evidence: "I run paid coaching." }],
  summary: "A paid coaching business.",
});

// ---- the classifier on top of any LLM strategy ----

test("the classifier sends the shared instructions, the prompt and the answer schema to whichever LLM it is given", async () => {
  const llm = new FakeLlm();
  llm.reply = {
    answers: [
      { questionId: 7, answer: "yes", evidence: "I run paid coaching." },
      { questionId: 8, answer: "no", evidence: "" },
    ],
    summary: "A paid coaching business.",
  };

  const result = await new LlmLeadClassifier({ llm }).classify(input);

  expect(llm.requests).toHaveLength(1);
  expect(llm.requests[0]?.system).toBe(classifierInstructions);
  expect(llm.requests[0]?.prompt).toBe(buildClassifierPrompt(input));
  expect(llm.requests[0]?.schema).toBe(classifierAnswerSchema);
  expect(result).toEqual({
    answers: [
      { questionId: 7, answer: "yes", evidence: "I run paid coaching." },
      { questionId: 8, answer: "no", evidence: null },
    ],
    summary: "A paid coaching business.",
    model: "fake-model",
  });
});

test("the classifier reports the provider and model of its LLM and passes its failures on", async () => {
  const llm = new FakeLlm();
  const classifier = new LlmLeadClassifier({ llm });

  expect([classifier.provider, classifier.model]).toEqual([
    "fake-provider",
    "fake-model",
  ]);

  llm.error = new Error("The provider is down");
  await expect(classifier.classify(input)).rejects.toThrow(
    "The provider is down",
  );
});

test("an answer that does not fit the schema never reaches the classifier's caller", async () => {
  const llm = new FakeLlm();
  llm.reply = {
    answers: [{ questionId: 7, answer: "maybe", evidence: "" }],
    summary: "x",
  };

  await expect(
    new LlmLeadClassifier({ llm }).classify(input),
  ).rejects.toThrow();
});

// ---- the Vercel AI SDK strategy ----

test("the AI SDK strategy sends the instructions and the message with a JSON format and reads the structured answer and usage", async () => {
  const model = new MockLanguageModelV4({ doGenerate: modelReply(answerText) });
  const llm = new AiSdkLlm({
    languageModel: model,
    model: "mock-model",
    provider: "mock",
  });

  const result = await llm.generateStructured({
    system: "Be strict.",
    prompt: "Question and lead text.",
    schema: classifierAnswerSchema,
  });

  expect(result.output).toEqual({
    answers: [
      { questionId: 7, answer: "yes", evidence: "I run paid coaching." },
    ],
    summary: "A paid coaching business.",
  });
  expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 40 });
  expect([llm.provider, llm.model]).toEqual(["mock", "mock-model"]);

  const call = model.doGenerateCalls[0];
  expect(call?.prompt[0]).toMatchObject({
    role: "system",
    content: "Be strict.",
  });
  expect(JSON.stringify(call?.prompt[1])).toContain("Question and lead text.");
  expect(call?.responseFormat).toMatchObject({ type: "json" });
  const format = call?.responseFormat;
  const jsonSchema =
    format && format.type === "json" ? format.schema : undefined;
  expect(jsonSchema).toMatchObject({
    type: "object",
    required: ["answers", "summary"],
  });
});

test("the AI SDK strategy fails on text that is not JSON and on JSON that breaks the schema", async () => {
  const request = { system: "s", prompt: "p", schema: classifierAnswerSchema };
  const notJson = new AiSdkLlm({
    languageModel: new MockLanguageModelV4({
      doGenerate: modelReply("sorry, no"),
    }),
    model: "m",
    provider: "mock",
  });
  const wrongShape = new AiSdkLlm({
    languageModel: new MockLanguageModelV4({
      doGenerate: modelReply(JSON.stringify({ answers: "none" })),
    }),
    model: "m",
    provider: "mock",
  });

  await expect(notJson.generateStructured(request)).rejects.toThrow();
  await expect(wrongShape.generateStructured(request)).rejects.toThrow();
});

test("the AI SDK strategy runs the classifier end to end", async () => {
  const model = new MockLanguageModelV4({ doGenerate: modelReply(answerText) });
  const classifier = new LlmLeadClassifier({
    llm: new AiSdkLlm({
      languageModel: model,
      model: "mock-model",
      provider: "mock",
    }),
  });

  const result = await classifier.classify(input);

  expect(result.answers).toEqual([
    { questionId: 7, answer: "yes", evidence: "I run paid coaching." },
  ]);
  expect(result.model).toBe("mock-model");
  expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(
    "QUESTIONS:",
  );
  expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(
    "I run paid coaching.",
  );
});

// ---- choosing the strategy ----

const envWith = (values: Record<string, string | undefined>) => ({
  ...initENV(),
  ...values,
});

test("the strategy is the Vercel AI SDK with OpenAI and the configured model", () => {
  const llm = createLlm(
    envWith({ OPENAI_API_KEY: "sk-openai", AI_FILTER_MODEL: "gpt-custom" }),
  );

  expect(llm).toBeInstanceOf(AiSdkLlm);
  expect([llm.provider, llm.model]).toEqual(["openai", "gpt-custom"]);
});
