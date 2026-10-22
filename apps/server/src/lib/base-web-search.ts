export interface WebSearchInput {
  query: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  maxResults?: number;
}

export interface WebSearchResult {
  url: string;
  title: string;
  content: string;
}

export abstract class BaseWebSearch {
  public abstract search(input: WebSearchInput): Promise<WebSearchResult[]>;
}
