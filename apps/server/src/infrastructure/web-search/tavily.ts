import { tavily, type TavilyClient } from "@tavily/core";
import {
  BaseWebSearch,
  WebSearchError,
  type WebSearchResult,
} from "@server/lib/base-web-search";

const DEFAULT_MAX_RESULTS = 5;

// The SDK throws plain errors without a status code, so permanent failures are told apart by message.
const PERMANENT_FAILURE =
  /api key|unauthorized|forbidden|invalid|plan|limit exceeded/i;

interface TavilyWebSearchInit {
  apiKey: string;
}

export class TavilyWebSearch extends BaseWebSearch {
  public override readonly isAvailable = true;
  private client: TavilyClient;

  public constructor(init: TavilyWebSearchInit) {
    super();
    this.client = tavily({ apiKey: init.apiKey });
  }

  public override async search(input: {
    query: string;
    maxResults?: number;
  }): Promise<WebSearchResult[]> {
    try {
      const response = await this.client.search(input.query, {
        maxResults: input.maxResults ?? DEFAULT_MAX_RESULTS,
      });

      return response.results.map(({ title, url, content }) => ({
        title,
        url,
        content,
      }));
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);

      throw new WebSearchError({
        message: `Tavily search failed: ${message}`,
        retryable: !PERMANENT_FAILURE.test(message),
        cause,
      });
    }
  }
}
