import { expect, test } from "bun:test";
import { TavilyWebSearch } from "@server/infrastructure/search/tavily";
import type { WebSearchResult } from "@server/lib/base-web-search";

class FlakySearch extends TavilyWebSearch {
  public attempts = 0;

  public constructor(private readonly failures: string[]) {
    super({ apiKey: "tvly-test" });
  }

  protected override async request(): Promise<WebSearchResult[]> {
    const failure = this.failures[this.attempts];
    this.attempts += 1;

    if (failure) throw new Error(failure);

    return [{ url: "https://example.com/", title: "Example", content: "" }];
  }
}

test("a search that fails once is tried again and returns the results", async () => {
  const search = new FlakySearch(["429 Error: too many requests"]);

  const results = await search.search({ query: "anything" });

  expect(search.attempts).toBe(2);
  expect(results).toEqual([
    { url: "https://example.com/", title: "Example", content: "" },
  ]);
});

test("a search that keeps failing gives up after three tries with the last error", async () => {
  const search = new FlakySearch(["boom 1", "boom 2", "boom 3", "boom 4"]);

  await expect(search.search({ query: "anything" })).rejects.toThrow("boom 3");
  expect(search.attempts).toBe(3);
}, 15_000);

test("a rejected key or a used-up plan is not retried", async () => {
  for (const message of [
    "Unauthorized: missing or invalid API key.",
    "432 Error: usage limit exceeded",
  ]) {
    const search = new FlakySearch([message, message]);

    await expect(search.search({ query: "anything" })).rejects.toThrow(message);
    expect(search.attempts).toBe(1);
  }
});
