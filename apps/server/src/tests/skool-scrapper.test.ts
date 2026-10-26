import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CustomSkoolScrapper } from "@server/infrastructure/skool-scrapper/custom";
import { SkoolScrapeError } from "@server/lib/base-skool-scrapper";
import { TestLogger } from "./helpers/context";

const FIXTURES = join(import.meta.dir, "fixtures", "skool");
const FREE_FIXTURES = join(import.meta.dir, "fixtures", "skool-free");

const respond = (url: string, body: string, status = 200) => {
  const response = new Response(body, { status });
  Object.defineProperty(response, "url", { value: url });
  return response;
};

const pageHtml = (nextData: unknown) =>
  `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;

const fixtureFetcher = (root: string) => async (url: string) => {
  const { pathname } = new URL(url);
  const file = pathname.startsWith("/@")
    ? `owners/${pathname.slice(2)}.html`
    : pathname === "/discovery"
      ? "discovery/page-01.html"
      : `communities/${pathname.split("/")[1]}.html`;
  const html = await Bun.file(join(root, file)).text();
  return respond(url, html);
};

const createScrapper = (fetcher: (url: string) => Promise<Response>) => {
  const logger = new TestLogger();
  const scrapper = new CustomSkoolScrapper({ logger, fetcher });
  return { scrapper, logger };
};

const aboutURL = (slug: string) => `https://www.skool.com/${slug}/about`;
const leadURL = (username: string) => `https://www.skool.com/@${username}`;

describe("pricing on real community pages", () => {
  const { scrapper } = createScrapper(fixtureFetcher(FIXTURES));

  test("monthly price: members x amount in cents / 100", async () => {
    const community = await scrapper.about({
      communityURL: aboutURL("barbenders"),
    });

    expect(community).toMatchObject({
      name: "Bar Benders Brotherhood",
      communityURL: "https://www.skool.com/barbenders",
      members: 5,
      mrr: 135,
      pricing: {
        type: "paid",
        amountCents: 2700,
        currency: "usd",
        interval: "month",
        source: "displayPrice",
      },
      leadURL: "https://www.skool.com/@tyler-crisp-9872",
    });
  });

  test("yearly price is spread over twelve months", async () => {
    const community = await scrapper.about({
      communityURL: aboutURL("taxes"),
    });

    expect(community?.members).toBe(1615);
    expect(community?.pricing).toMatchObject({
      type: "paid",
      interval: "year",
    });
    expect(community?.mrr).toBe(Math.round((1615 * (100 / 12)) / 100));
  });

  test("one_time price is not recurring revenue", async () => {
    const community = await scrapper.about({
      communityURL: aboutURL("databroker"),
    });

    expect(community?.members).toBe(104);
    expect(community?.pricing).toMatchObject({ interval: "one_time" });
    expect(community?.mrr).toBe(0);
  });

  test("legacy community without displayPrice uses its bare monthly price", async () => {
    const community = await scrapper.about({
      communityURL: aboutURL("organicoptimisation"),
    });

    expect(community?.members).toBe(204);
    expect(community?.pricing).toEqual({
      type: "paid",
      amountCents: 4900,
      currency: "usd",
      interval: "month",
      source: "legacy",
    });
    expect(community?.mrr).toBe(204 * 49);
  });

  const communityPage = (metadata: object) =>
    pageHtml({
      props: {
        pageProps: {
          currentGroup: {
            name: "x",
            metadata: {
              displayName: "X",
              description: "d",
              totalMembers: 10,
              owner: JSON.stringify({ name: "o" }),
              ...metadata,
            },
          },
        },
      },
    });

  test("a community with no price attributes is free", async () => {
    const { scrapper, logger } = createScrapper(async (url) =>
      respond(url, communityPage({})),
    );

    const community = await scrapper.about({ communityURL: aboutURL("x") });

    expect(community).toMatchObject({ pricing: { type: "free" }, mrr: 0 });
    expect(logger.records.filter((r) => r.level === "warn")).toHaveLength(0);
  });

  test("a real free community", async () => {
    const { scrapper } = createScrapper(fixtureFetcher(FREE_FIXTURES));

    const community = await scrapper.about({
      communityURL: aboutURL("lifecoachcertificationfree"),
    });

    expect(community).toMatchObject({
      members: 22731,
      pricing: { type: "free" },
      mrr: 0,
    });
  });

  test("conflicting displayPrice and currentMBp keeps displayPrice and logs", async () => {
    const { scrapper, logger } = createScrapper(async (url) =>
      respond(
        url,
        communityPage({
          displayPrice: JSON.stringify({
            currency: "usd",
            amount: 4700,
            recurring_interval: "month",
          }),
          currentMBp: JSON.stringify({ currency: "usd", amount: 9700 }),
        }),
      ),
    );

    const community = await scrapper.about({ communityURL: aboutURL("x") });

    expect(community?.pricing).toMatchObject({ amountCents: 4700 });
    expect(logger.records.filter((r) => r.level === "warn")).toHaveLength(1);
  });

  test("an unknown recurring_interval is rejected, not a silent zero", async () => {
    const { scrapper } = createScrapper(async (url) =>
      respond(
        url,
        communityPage({
          displayPrice: JSON.stringify({
            currency: "usd",
            amount: 100,
            recurring_interval: "week",
          }),
        }),
      ),
    );

    const error = await scrapper
      .about({ communityURL: aboutURL("x") })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ZodError);
  });
});

describe("images", () => {
  test("a community carries its cover thumbnail and logo", async () => {
    const { scrapper } = createScrapper(fixtureFetcher(FIXTURES));

    const community = await scrapper.about({
      communityURL: aboutURL("barbenders"),
    });

    expect(community).toMatchObject({
      thumbnailUrl:
        "https://assets.skool.com/f/39ccd4e1bcc3438d8eaf61ba7c6cb49c/6ba56dad7f4c48f5bad4e480e7b1739bd462379232914ca8ae1c9c47322184c2-md.jpg",
      logoUrl:
        "https://assets.skool.com/f/39ccd4e1bcc3438d8eaf61ba7c6cb49c/0ae009ca483c48c685074eb814ff9e6ec88a2f80edc4459f94024bb627aeeb6e.jpg",
    });
  });

  test("a lead carries the medium profile picture", async () => {
    const { scrapper } = createScrapper(fixtureFetcher(FIXTURES));

    const lead = await scrapper.lead({ leadURL: leadURL("term-sheet-9378") });

    expect(lead?.pictureUrl).toBe(
      "https://assets.skool.com/f/7b2e945c23664d7ba8d6e0353ece6dac/8c26189497d1430395ab924bce87d78e5c7a8d32dcaa4206ab6f83dd4bd49c26.jpg",
    );
  });

  test("missing or empty images become null instead of failing the page", async () => {
    const communityPage = (metadata: object) =>
      pageHtml({
        props: {
          pageProps: {
            currentGroup: {
              name: "x",
              metadata: {
                displayName: "X",
                description: "d",
                totalMembers: 1,
                owner: JSON.stringify({ name: "o" }),
                ...metadata,
              },
            },
          },
        },
      });
    const { scrapper } = createScrapper(async (url) =>
      respond(
        url,
        url.endsWith("/about")
          ? communityPage({ logoUrl: "", coverSmallUrl: null })
          : pageHtml({
              props: {
                pageProps: {
                  currentUser: {
                    name: "o",
                    firstName: "O",
                    lastName: "Wner",
                    metadata: { bio: "", pictureProfile: "" },
                  },
                },
              },
            }),
      ),
    );

    const community = await scrapper.about({ communityURL: aboutURL("x") });
    const lead = await scrapper.lead({ leadURL: leadURL("o") });

    expect(community).toMatchObject({ thumbnailUrl: null, logoUrl: null });
    expect(lead?.pictureUrl).toBeNull();
  });
});

describe("community email", () => {
  const communityPage = (metadata: object) =>
    pageHtml({
      props: {
        pageProps: {
          currentGroup: {
            name: "x",
            metadata: {
              displayName: "X",
              description: "d",
              totalMembers: 1,
              owner: JSON.stringify({ name: "o" }),
              ...metadata,
            },
          },
        },
      },
    });

  test("is found in the landing page text of a real community", async () => {
    const { scrapper } = createScrapper(fixtureFetcher(FIXTURES));

    const community = await scrapper.about({
      communityURL: aboutURL("sergerdreamclub"),
    });

    expect(community?.email).toMatch(/@/);
  });

  test("is null when neither text has one", async () => {
    const { scrapper } = createScrapper(fixtureFetcher(FIXTURES));

    const community = await scrapper.about({
      communityURL: aboutURL("barbenders"),
    });

    expect(community?.email).toBeNull();
  });

  test("description wins over the landing page text", async () => {
    const { scrapper } = createScrapper(async (url) =>
      respond(
        url,
        communityPage({
          description: "write hello@a.com",
          lpDescription: "or other@b.com",
        }),
      ),
    );

    const community = await scrapper.about({ communityURL: aboutURL("x") });

    expect(community?.email).toBe("hello@a.com");
  });
});

describe("discover on a real discovery page", () => {
  test("returns every community of the page with mrr from the legacy or current price", async () => {
    const { scrapper, logger } = createScrapper(fixtureFetcher(FIXTURES));

    const communities = await scrapper.discover({ search: "coaching" });

    expect(communities).toHaveLength(30);
    expect(communities[0]).toEqual({
      name: "Mark Haughton Manifestation",
      communityURL: "https://www.skool.com/mark-haughton-manifestation-3021",
      description: expect.stringContaining("manifestation"),
      members: 405,
      pricing: {
        type: "paid",
        amountCents: 4900,
        currency: "usd",
        interval: "month",
        source: "legacy",
      },
      mrr: 405 * 49,
      email: null,
      thumbnailUrl:
        "https://assets.skool.com/f/e44ffa14d5294d2b9cfa6ccd4981d292/9b45cf70b62c4a43b48193ab0df7166a7e81d5d49fd04e94a495c5aaf08e0c36-md.jpg",
      logoUrl:
        "https://assets.skool.com/f/e44ffa14d5294d2b9cfa6ccd4981d292/d069a7ff8f164c9e90fb2dbac8fe3342f71be8c78c7c40d8a76c7e03f0815d53",
    });
    expect(communities.every((community) => community.mrr >= 0)).toBe(true);
    expect(logger.records.filter((r) => r.level === "warn")).toHaveLength(0);
  });

  test("fetches page one, then every other page at once, always public paid english", async () => {
    const requested: string[] = [];
    const { scrapper } = createScrapper(async (url) => {
      requested.push(url);
      return fixtureFetcher(FIXTURES)("https://www.skool.com/discovery");
    });

    const communities = await scrapper.discover({ search: "coaching" });

    const base =
      "https://www.skool.com/discovery?q=coaching&ty=public&pr=paid&lang=english";
    expect(requested[0]).toBe(base);
    expect(requested.slice(1).toSorted()).toEqual(
      Array.from(
        { length: 33 },
        (_, index) => `${base}&p=${index + 2}`,
      ).toSorted(),
    );
    // Every page served the same thirty communities, which collapse into one list
    expect(communities).toHaveLength(30);
  });

  test("asks for no more pages than the results fill", async () => {
    const requested: string[] = [];
    const page = (numGroups: number, names: string[]) =>
      pageHtml({
        props: {
          pageProps: {
            numGroups,
            groups: names.map((name) => ({
              group: {
                name,
                metadata: {
                  displayName: name,
                  description: "d",
                  totalMembers: 1,
                  currentMBp: JSON.stringify({ currency: "usd", amount: 100 }),
                },
              },
            })),
          },
        },
      });
    const { scrapper } = createScrapper(async (url) => {
      requested.push(url);
      const pageNumber = new URL(url).searchParams.get("p") ?? "1";
      return respond(
        url,
        pageNumber === "1" ? page(3, ["a", "b"]) : page(3, ["c"]),
      );
    });

    const communities = await scrapper.discover({ search: "x" });

    expect(requested).toHaveLength(2);
    expect(communities.map((community) => community.name)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  describe("when some pages fail", () => {
    const groupsPage = (names: string[]) =>
      pageHtml({
        props: {
          pageProps: {
            numGroups: 3,
            groups: names.map((name) => ({
              group: {
                name,
                metadata: {
                  displayName: name,
                  description: "d",
                  totalMembers: 1,
                  currentMBp: JSON.stringify({ currency: "usd", amount: 100 }),
                },
              },
            })),
          },
        },
      });

    const pageNumber = (url: string) =>
      Number(new URL(url).searchParams.get("p") ?? "1");

    test("keeps the pages that worked and logs the ones that did not", async () => {
      const { scrapper, logger } = createScrapper(async (url) =>
        pageNumber(url) === 2
          ? respond(url, "", 500)
          : respond(url, groupsPage([`page-${pageNumber(url)}`])),
      );

      const communities = await scrapper.discover({ search: "x" });

      expect(communities.map((community) => community.name)).toEqual([
        "page-1",
        "page-3",
      ]);
      expect(logger.records.filter((r) => r.level === "warn")).toHaveLength(1);
      expect(JSON.stringify(logger.records)).toContain('"failedPages":[2]');
    });

    test("throws when every extra page fails", async () => {
      const { scrapper } = createScrapper(async (url) =>
        pageNumber(url) === 1
          ? respond(url, groupsPage(["page-1"]))
          : respond(url, "", 429),
      );

      const error = await scrapper
        .discover({ search: "x" })
        .catch((caught: unknown) => caught);

      expect(error).toMatchObject({ kind: "rate_limited", retryable: true });
    });

    test("throws when the first page fails", async () => {
      const { scrapper } = createScrapper(async (url) =>
        respond(url, "", pageNumber(url) === 1 ? 202 : 200),
      );

      const error = await scrapper
        .discover({ search: "x" })
        .catch((caught: unknown) => caught);

      expect(error).toMatchObject({ kind: "blocked" });
    });
  });

  test("skips a malformed community and logs it", async () => {
    const { scrapper, logger } = createScrapper(async (url) =>
      respond(
        url,
        pageHtml({
          props: {
            pageProps: {
              numGroups: 1,
              groups: [
                {
                  group: {
                    name: "good",
                    metadata: {
                      displayName: "Good",
                      description: "d",
                      totalMembers: 3,
                      currentMBp: JSON.stringify({
                        currency: "usd",
                        amount: 100,
                      }),
                    },
                  },
                },
                { group: { metadata: {} } },
              ],
            },
          },
        }),
      ),
    );

    const communities = await scrapper.discover({ search: "x" });

    expect(communities.map((community) => community.communityURL)).toEqual([
      "https://www.skool.com/good",
    ]);
    expect(logger.records.filter((r) => r.level === "warn")).toHaveLength(1);
  });
});

describe("lead on real profile pages", () => {
  const { scrapper } = createScrapper(fixtureFetcher(FIXTURES));

  test("Skool never fills currentUser.email, so it comes from the bio", async () => {
    const lead = await scrapper.lead({
      leadURL: leadURL("chrissy-michelle-3151"),
    });

    expect(lead).toMatchObject({
      name: "Chrissy Michelle",
      username: "chrissy-michelle-3151",
      email: "chrissymichelle.co@gmail.com",
    });
  });

  test("email is null when the bio has none", async () => {
    const lead = await scrapper.lead({ leadURL: leadURL("term-sheet-9378") });

    expect(lead).toMatchObject({
      bio: "Win the AI Gold Rush with the Authority of an Advisory.",
      email: null,
      instagram: null,
      website: null,
    });
  });
});

describe("failure handling", () => {
  const statusScrapper = (status: number) =>
    createScrapper(async (url) => respond(url, "", status));

  test("404 means the entity does not exist", async () => {
    const { scrapper } = statusScrapper(404);

    expect(await scrapper.about({ communityURL: aboutURL("gone") })).toBeNull();
    expect(await scrapper.lead({ leadURL: leadURL("gone") })).toBeNull();
  });

  test.each([
    [202, "blocked"],
    [403, "blocked"],
    [429, "rate_limited"],
    [500, "upstream"],
  ])("status %d is a retryable %s error", async (status, kind) => {
    const { scrapper } = statusScrapper(status);

    const error = await scrapper
      .about({ communityURL: aboutURL("x") })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SkoolScrapeError);
    expect(error).toMatchObject({ kind, retryable: true });
  });

  test("a network failure is a retryable upstream error", async () => {
    const { scrapper } = createScrapper(async () => {
      throw new Error("socket hang up");
    });

    const error = await scrapper
      .lead({ leadURL: leadURL("x") })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ kind: "upstream", retryable: true });
  });

  test("a redirect to another path is treated as not found", async () => {
    const { scrapper } = createScrapper(async () =>
      respond("https://www.skool.com/login", "<html></html>"),
    );

    expect(await scrapper.about({ communityURL: aboutURL("x") })).toBeNull();
  });

  test("a page without __NEXT_DATA__ is a non-retryable parse error", async () => {
    const { scrapper } = createScrapper(async (url) =>
      respond(url, "<html><body>layout changed</body></html>"),
    );

    const error = await scrapper
      .lead({ leadURL: leadURL("x") })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ kind: "parse", retryable: false });
  });

  test("a changed response shape throws a ZodError naming the field", async () => {
    const { scrapper } = createScrapper(async (url) =>
      respond(
        url,
        pageHtml({ props: { pageProps: { currentGroup: { name: 1 } } } }),
      ),
    );

    const error = await scrapper
      .about({ communityURL: aboutURL("x") })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ZodError);
    expect(error instanceof ZodError && error.issues[0]?.path).toEqual([
      "props",
      "pageProps",
      "currentGroup",
      "name",
    ]);
  });

  test("a page missing its entity is rejected", async () => {
    const { scrapper } = createScrapper(async (url) =>
      respond(url, pageHtml({ props: { pageProps: {} } })),
    );

    const aboutError = await scrapper
      .about({ communityURL: aboutURL("x") })
      .catch((caught: unknown) => caught);
    const leadError = await scrapper
      .lead({ leadURL: leadURL("x") })
      .catch((caught: unknown) => caught);

    expect(aboutError).toBeInstanceOf(ZodError);
    expect(leadError).toBeInstanceOf(ZodError);
  });

  test.each([
    ["not a url", "invalid_input"],
    ["https://example.com/foo", "invalid_input"],
    ["https://www.skool.com/", "invalid_input"],
  ])("rejects %s before fetching", async (url, kind) => {
    const { scrapper } = createScrapper(async () => {
      throw new Error("must not fetch");
    });

    const error = await scrapper
      .about({ communityURL: url })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ kind, retryable: false });
  });
});

const DOWNLOAD_DIRS = ["skool-html", "skool-html-paid"]
  .map((dir) => join(import.meta.dir, "..", "..", dir))
  .filter((dir) => existsSync(join(dir, "owners")));

describe.each(DOWNLOAD_DIRS)("every page downloaded into %s parses", (root) => {
  const slugs = (dir: string) =>
    readdirSync(join(root, dir)).map((file) => file.replace(".html", ""));

  test("all discovery pages parse without skipping a community", async () => {
    for (const page of slugs("discovery")) {
      const html = await Bun.file(
        join(root, "discovery", `${page}.html`),
      ).text();
      const { scrapper: pageScrapper, logger: pageLogger } = createScrapper(
        async (url) => respond(url, html),
      );

      const communities = await pageScrapper.discover({ search: "coaching" });

      expect(communities).toHaveLength(30);
      expect(
        pageLogger.records.filter((r) => JSON.stringify(r).includes("Skipped")),
      ).toHaveLength(0);
    }
  });

  test("all communities parse and are paid in USD", async () => {
    const { scrapper } = createScrapper(fixtureFetcher(root));

    for (const slug of slugs("communities")) {
      const community = await scrapper.about({ communityURL: aboutURL(slug) });
      expect(community?.communityURL).toBe(`https://www.skool.com/${slug}`);
      expect(community?.pricing).toMatchObject({
        type: "paid",
        currency: "usd",
      });
      expect(Number.isFinite(community?.mrr)).toBe(true);
    }
  });

  test("all owners parse", async () => {
    const { scrapper } = createScrapper(fixtureFetcher(root));

    for (const slug of slugs("owners")) {
      const lead = await scrapper.lead({ leadURL: leadURL(slug) });
      expect(lead?.username).toBe(slug);
    }
  });
});
