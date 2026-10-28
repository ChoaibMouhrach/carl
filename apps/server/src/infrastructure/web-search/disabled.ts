import {
  BaseWebSearch,
  WebSearchError,
  type WebSearchResult,
} from "@server/lib/base-web-search";

export class DisabledWebSearch extends BaseWebSearch {
  public override readonly isAvailable = false;

  public override async search(): Promise<WebSearchResult[]> {
    throw new WebSearchError({
      message: "Web search is not configured.",
      retryable: false,
    });
  }
}
