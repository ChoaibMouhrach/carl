export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

export class WebSearchError extends Error {
  public readonly retryable: boolean;

  public constructor(input: {
    message: string;
    retryable: boolean;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "WebSearchError";
    this.retryable = input.retryable;
  }
}

export abstract class BaseWebSearch {
  /** Whether searches actually reach a provider */
  public abstract readonly isAvailable: boolean;

  public abstract search(input: {
    query: string;
    maxResults?: number;
  }): Promise<WebSearchResult[]>;
}
