import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import IORedis from "ioredis";
import {
  BaseEmailFinder,
  type EmailBatchSnapshot,
  type EmailBatchStart,
  type EmailLookup,
} from "../../lib/base-email-finder";
import {
  emailFinderScriptKey,
  emailFinderScriptSchema,
  lookupIdentity,
} from "./script";

interface ScriptedEmailFinderInit {
  redisUrl: string;
}

/** For e2e tests: emails come from a script by LinkedIn URL (or name and domain) and the answer is immediate, with an unscripted lookup finding nothing instead of a paid search */
export class ScriptedEmailFinder extends BaseEmailFinder {
  public readonly provider = "scripted";

  private redis: IORedis;

  public constructor(init: ScriptedEmailFinderInit) {
    super();

    this.redis = new IORedis(init.redisUrl);
  }

  public override async start(input: {
    batchId: string;
    lookups: EmailLookup[];
  }): Promise<EmailBatchStart> {
    const providerId = `scripted-${randomUUID()}`;
    const results = await Promise.all(
      input.lookups.map(async (lookup, ref) => {
        const raw = await this.redis.get(
          emailFinderScriptKey(lookupIdentity(lookup)),
        );

        if (!raw) return { ref, email: null };

        const script = emailFinderScriptSchema.parse(JSON.parse(raw));

        if (script.delayMs) await sleep(script.delayMs);

        return { ref, email: script.email };
      }),
    );

    return {
      providerId,
      snapshot: {
        providerId,
        batchId: input.batchId,
        state: "finished",
        reason: null,
        results,
      },
    };
  }

  public override async fetch(providerId: string): Promise<EmailBatchSnapshot> {
    return {
      providerId,
      batchId: null,
      state: "finished",
      reason: null,
      results: [],
    };
  }
}
