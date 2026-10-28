import { z } from "zod";
import {
  BaseWebSearch,
  WebSearchError,
  type WebSearchResult,
} from "@server/lib/base-web-search";

const SEARCH_URL = "https://api.tavily.com/search";
const DEFAULT_MAX_RESULTS = 5;

const responseSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      content: z.string(),
    }),
  ),
});

interface TavilyWebSearchInit {
  apiKey: string;
}

export class TavilyWebSearch extends BaseWebSearch {
  public override readonly isAvailable = true;
  private apiKey: string;

  public constructor(init: TavilyWebSearchInit) {
    super();
    this.apiKey = init.apiKey;
  }

  public override async search(input: {
    query: string;
    maxResults?: number;
  }): Promise<WebSearchResult[]> {
    const response = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        query: input.query,
        max_results: input.maxResults ?? DEFAULT_MAX_RESULTS,
      }),
    }).catch((cause: unknown) => {
      throw new WebSearchError({
        message: "Tavily could not be reached.",
        retryable: true,
        cause,
      });
    });

    if (!response.ok) {
      throw new WebSearchError({
        message: `Tavily answered with status ${response.status}.`,
        retryable: response.status === 429 || response.status >= 500,
      });
    }

    const body = responseSchema.parse(await response.json());

    return body.results;
  }
}
