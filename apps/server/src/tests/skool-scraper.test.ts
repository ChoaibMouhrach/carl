import { afterEach, expect, test } from "bun:test";
import { CustomSkoolScraper } from "@server/infrastructure/skool/custom";

const originalFetch = globalThis.fetch;

const stubFetch = (respond: (url: string) => Response) => {
  const requests: string[] = [];

  globalThis.fetch = Object.assign(
    async (input: Parameters<typeof fetch>[0]) => {
      const url = input instanceof Request ? input.url : String(input);
      requests.push(url);
      return respond(url);
    },
    { preconnect: originalFetch.preconnect },
  );

  return requests;
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const query = {
  visibility: "public",
  price: "paid",
  keyword: "pickleball",
  page: 1,
} as const;

test("a search with no English results is empty instead of failing", async () => {
  const requests = stubFetch(
    () =>
      new Response(null, {
        status: 307,
        headers: {
          location: "/discovery?ty=public&q=pickleball&lang=all&pr=paid",
        },
      }),
  );

  const page = await new CustomSkoolScraper({ maxAttempts: 1 }).discover(query);

  expect(page).toEqual({ totalGroups: 0, groups: [] });
  // The all-languages page is never fetched
  expect(requests).toHaveLength(1);
  expect(requests[0]).toContain("lang=english");
});

test("any other redirect is still an error", async () => {
  stubFetch(
    () => new Response(null, { status: 307, headers: { location: "/login" } }),
  );

  await expect(
    new CustomSkoolScraper({ maxAttempts: 1 }).discover(query),
  ).rejects.toThrow("Skool answered 307");
});
