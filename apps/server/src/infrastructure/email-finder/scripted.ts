import { setTimeout as sleep } from "node:timers/promises";
import IORedis from "ioredis";
import {
  BaseEmailFinder,
  type EmailLookup,
  type EmailLookupResult,
} from "@server/lib/base-email-finder";
import {
  emailFinderScriptKey,
  emailFinderScriptSchema,
  lookupIdentity,
} from "./script";

interface ScriptedEmailFinderInit {
  redisUrl: string;
}

/** For e2e tests: emails come from a script by LinkedIn URL (or name and domain), and an unscripted lookup finds nothing instead of a paid search */
export class ScriptedEmailFinder extends BaseEmailFinder {
  public readonly provider = "scripted";

  private redis: IORedis;

  public constructor(init: ScriptedEmailFinderInit) {
    super();

    this.redis = new IORedis(init.redisUrl);
  }

  public override async find(
    lookups: EmailLookup[],
  ): Promise<EmailLookupResult[]> {
    return await Promise.all(
      lookups.map(async (lookup) => {
        const raw = await this.redis.get(
          emailFinderScriptKey(lookupIdentity(lookup)),
        );

        if (!raw) return { key: lookup.key, email: null };

        const script = emailFinderScriptSchema.parse(JSON.parse(raw));

        if (script.delayMs) await sleep(script.delayMs);

        return { key: lookup.key, email: script.email };
      }),
    );
  }
}
