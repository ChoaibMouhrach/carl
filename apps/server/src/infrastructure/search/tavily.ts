import { setTimeout as sleep } from "node:timers/promises";
import { tavily } from "@tavily/core";
import {
  BaseWebSearch,
  type WebSearchInput,
  type WebSearchResult,
} from "@server/lib/base-web-search";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_000;
const PERMANENT_FAILURE =
  /\b(401|403|432|433)\b|unauthorized|api key|usage limit|plan/i;

interface TavilyWebSearchInit {
  apiKey: string;
}

export class TavilyWebSearch extends BaseWebSearch {
  public readonly provider = "tavily";

  private client: ReturnType<typeof tavily>;

  public constructor(init: TavilyWebSearchInit) {
    super();

    this.client = tavily({ apiKey: init.apiKey });
  }

  public override async search(
    input: WebSearchInput,
  ): Promise<WebSearchResult[]> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.request(input);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (attempt >= MAX_ATTEMPTS || PERMANENT_FAILURE.test(message)) {
          throw error;
        }

        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  protected async request(input: WebSearchInput): Promise<WebSearchResult[]> {
    const response = await this.client.search(input.query, {
      searchDepth: "basic",
      maxResults: input.maxResults ?? 5,
      includeDomains: input.includeDomains,
      excludeDomains: input.excludeDomains,
    });

    return response.results.map((result) => ({
      url: result.url,
      title: result.title,
      content: result.content,
    }));
  }
}
