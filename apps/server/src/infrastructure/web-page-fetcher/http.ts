import { BaseWebPageFetcher } from "@server/lib/base-web-page-fetcher";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_HTML_CHARS = 2_000_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export class HttpWebPageFetcher extends BaseWebPageFetcher {
  public override async fetchHtml(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.includes("text/html")) return null;

      const html = await response.text();
      return html.slice(0, MAX_HTML_CHARS);
    } catch {
      return null;
    }
  }
}
