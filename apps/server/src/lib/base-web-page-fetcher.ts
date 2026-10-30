export abstract class BaseWebPageFetcher {
  /** The page's HTML, or null when it is missing, not HTML or unreachable */
  public abstract fetchHtml(url: string): Promise<string | null>;
}
