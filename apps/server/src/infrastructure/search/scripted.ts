import { setTimeout as sleep } from "node:timers/promises";
import IORedis from "ioredis";
import {
  BaseWebSearch,
  type WebSearchInput,
  type WebSearchResult,
} from "@server/lib/base-web-search";
import { webSearchScriptKey, webSearchScriptSchema } from "./script";

interface ScriptedWebSearchInit {
  redisUrl: string;
}

/** For e2e tests: results come from a script by exact query, and an unscripted query finds nothing instead of a paid search */
export class ScriptedWebSearch extends BaseWebSearch {
  public readonly provider = "scripted";

  private redis: IORedis;

  public constructor(init: ScriptedWebSearchInit) {
    super();

    this.redis = new IORedis(init.redisUrl);
  }

  public override async search(
    input: WebSearchInput,
  ): Promise<WebSearchResult[]> {
    const raw = await this.redis.get(webSearchScriptKey(input.query));

    if (!raw) return [];

    const script = webSearchScriptSchema.parse(JSON.parse(raw));

    if (script.delayMs) await sleep(script.delayMs);

    return script.results;
  }
}
