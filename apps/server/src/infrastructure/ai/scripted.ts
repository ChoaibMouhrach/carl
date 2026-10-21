import IORedis from "ioredis";
import { BadRequestError } from "@server/lib/errors";
import {
  BaseLeadClassifier,
  type ClassifierInput,
  type ClassifierOutput,
} from "@server/lib/base-lead-classifier";
import { leadScriptKey, leadScriptSchema } from "./script";

interface ScriptedLeadClassifierInit {
  redisUrl: string;
}

/** For e2e tests: answers come from a script, and a lead without one is an error instead of a paid request */
export class ScriptedLeadClassifier extends BaseLeadClassifier {
  public readonly provider = "scripted";
  public readonly model = "scripted";

  private redis: IORedis;

  public constructor(init: ScriptedLeadClassifierInit) {
    super();

    this.redis = new IORedis(init.redisUrl);
  }

  public override async classify(
    input: ClassifierInput,
  ): Promise<ClassifierOutput> {
    const raw = await this.redis.get(leadScriptKey(input.leadUsername));

    if (!raw) {
      throw new BadRequestError({
        message: `No scripted answers for ${input.leadUsername}.`,
      });
    }

    const script = leadScriptSchema.parse(JSON.parse(raw));

    return {
      answers: input.questions.map((question) => {
        const scripted = script.answers[question.label];

        return {
          questionId: question.questionId,
          answer: scripted?.answer ?? "unknown",
          evidence: scripted?.evidence ?? null,
        };
      }),
      summary: script.summary ?? "Scripted assessment.",
      model: "scripted",
    };
  }
}
