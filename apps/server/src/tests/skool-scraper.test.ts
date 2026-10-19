import { afterEach, expect, test } from "bun:test";
import { CustomSkoolScraper } from "@server/infrastructure/skool/custom";

const originalFetch = globalThis.fetch;

interface Recorded {
  url: string;
  headers: Record<string, string>;
}

const stubFetch = (respond: (url: string, call: number) => Response) => {
  const requests: Recorded[] = [];

  globalThis.fetch = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      requests.push({
        url,
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
      });
      return respond(url, requests.length);
    },
    { preconnect: originalFetch.preconnect },
  );

  return requests;
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const scraper = () =>
  new CustomSkoolScraper({ maxAttempts: 3, retryDelayMs: 1 });

const nextData = (pageProps: object) =>
  `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps } })}</script></body></html>`;

const html = (pageProps: object) =>
  new Response(nextData(pageProps), { status: 200 });

const query = {
  visibility: "public",
  price: "paid",
  keyword: "pickleball",
  page: 1,
} as const;

const emptyDiscovery = { numGroups: 0, groups: [] };

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

  const page = await scraper().discover(query);

  expect(page).toEqual({ totalGroups: 0, groups: [] });
  // The all-languages page is never fetched
  expect(requests).toHaveLength(1);
  expect(requests[0]?.url).toContain("lang=english");
});

test("any other redirect is still an error and is not retried", async () => {
  const requests = stubFetch(
    () => new Response(null, { status: 307, headers: { location: "/login" } }),
  );

  await expect(scraper().discover(query)).rejects.toThrow("Skool answered 307");
  expect(requests).toHaveLength(1);
});

test("a discovery request names the search, asks for English and sends only a user agent", async () => {
  const requests = stubFetch(() => html(emptyDiscovery));

  await scraper().discover({ ...query, keyword: "business coaching", page: 3 });

  const url = new URL(requests[0]!.url);
  expect(url.pathname).toBe("/discovery");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    ty: "public",
    q: "business coaching",
    lang: "english",
    pr: "paid",
    p: "3",
  });
  // An accept header makes Skool answer with a bot challenge, so nothing else may be sent
  expect(Object.keys(requests[0]!.headers)).toEqual(["user-agent"]);
});

test("discovery results are read from the page data", async () => {
  stubFetch(() =>
    html({
      numGroups: 137,
      groups: [
        {
          group: {
            id: "g-1",
            name: "yoga-hub",
            createdAt: "2024-03-01T10:00:00Z",
            updatedAt: null,
            public: true,
            metadata: {
              displayName: "Yoga Hub",
              description: "",
              totalMembers: 412,
              membershipModel: 2,
              displayPrice: JSON.stringify({
                amount: 2900,
                currency: "usd",
                recurring_interval: "month",
              }),
              reviewCount: 8,
              reviewAverageRating: "4.5",
              logoUrl: "",
            },
          },
        },
        { group: { id: "g-2", name: "bare", metadata: {} } },
      ],
    }),
  );

  const page = await scraper().discover(query);

  expect(page.totalGroups).toBe(137);
  expect(page.groups).toHaveLength(2);
  expect(page.groups[0]).toMatchObject({
    skoolId: "g-1",
    name: "yoga-hub",
    displayName: "Yoga Hub",
    description: null,
    memberCount: 412,
    isPublic: true,
    membershipModel: 2,
    displayPrice: { currency: "usd", amount: 2900, interval: "month" },
    reviewCount: 8,
    reviewRating: 4.5,
    logoUrl: null,
  });
  expect(page.groups[0]?.createdAt?.toISOString()).toBe(
    "2024-03-01T10:00:00.000Z",
  );
  expect(page.groups[1]).toMatchObject({
    displayName: "bare",
    memberCount: 0,
    isPublic: false,
    displayPrice: null,
    reviewCount: null,
  });
});

test("a bot challenge, a rate limit and a server error are retried until the page arrives", async () => {
  const statuses = [202, 429, 503];
  const requests = stubFetch((_url, call) =>
    call <= statuses.length
      ? new Response(null, { status: statuses[call - 1] })
      : html(emptyDiscovery),
  );

  const page = await new CustomSkoolScraper({
    maxAttempts: 4,
    retryDelayMs: 1,
  }).discover(query);

  expect(page.totalGroups).toBe(0);
  expect(requests).toHaveLength(4);
});

test("a server error that never clears is given up on after the attempts are used", async () => {
  const requests = stubFetch(() => new Response(null, { status: 500 }));

  await expect(scraper().discover(query)).rejects.toThrow("Skool answered 500");
  expect(requests).toHaveLength(3);
});

test("a page that is not found is not retried", async () => {
  const requests = stubFetch(() => new Response(null, { status: 404 }));

  await expect(scraper().about("gone-club")).rejects.toThrow(
    "Skool answered 404",
  );
  expect(requests).toHaveLength(1);
});

test("a page without its data block is retried and then reported", async () => {
  const requests = stubFetch(
    () => new Response("<html>nothing</html>", { status: 200 }),
  );

  await expect(scraper().discover(query)).rejects.toThrow(
    "__NEXT_DATA__ missing",
  );
  expect(requests).toHaveLength(3);
});

test("a page whose data block is broken is reported straight away", async () => {
  const requests = stubFetch(
    () =>
      new Response(
        '<script id="__NEXT_DATA__" type="application/json">{not json</script>',
        { status: 200 },
      ),
  );

  await expect(scraper().discover(query)).rejects.toThrow();
  expect(requests).toHaveLength(1);
});

test("a community page yields the owner, tiers and every setting that matters", async () => {
  const requests = stubFetch(() =>
    html({
      currentGroup: {
        id: "g-1",
        name: "yoga-hub",
        public: true,
        metadata: {
          displayName: "Yoga Hub",
          description: "Short",
          lpDescription: "Long",
          totalMembers: 900,
          membershipModel: 4,
          plan: "pro",
          freeTrialEnabled: 1,
          totalPosts: 10,
          reviewAverageRating: 4.8,
          aflPercent: 40,
          freeBenefits: JSON.stringify(["Weekly call"]),
          links: JSON.stringify({
            links: [{ url: "https://yoga.example.com", label: "Site" }],
          }),
          surveyEnabled: 1,
          survey: JSON.stringify({
            survey: [{ question: "Why?", type: "text" }],
          }),
          owner: JSON.stringify({
            id: "u-1",
            name: "yoga-yvonne",
            first_name: "Yvonne",
            created_at: "2023-01-02T00:00:00Z",
            metadata: {
              bio: "Teacher",
              link_linkedin: "https://linkedin.com/in/yvonne",
            },
          }),
        },
      },
      groupMembershipProducts: [
        {
          tier: "Basic",
          model: "monthly",
          monthlyBpId: "m1",
          metadata: { benefits: JSON.stringify(["Videos"]) },
        },
        { tier: "Old", deactivatedAt: "2024-01-01" },
      ],
    }),
  );

  const about = await scraper().about("yoga-hub");

  expect(requests[0]?.url).toBe("https://www.skool.com/yoga-hub/about");
  expect(about).toMatchObject({
    skoolId: "g-1",
    displayName: "Yoga Hub",
    memberCount: 900,
    freeTrialEnabled: true,
    affiliatePercent: 40,
    freeBenefits: ["Weekly call"],
    links: [{ url: "https://yoga.example.com", label: "Site" }],
    membershipQuestions: [{ question: "Why?", type: "text" }],
  });
  expect(about.tiers).toEqual([
    {
      tier: "Basic",
      model: "monthly",
      benefits: ["Videos"],
      hasMonthly: true,
      hasAnnual: false,
      hasOneTime: false,
      active: true,
    },
    {
      tier: "Old",
      model: "",
      benefits: [],
      hasMonthly: false,
      hasAnnual: false,
      hasOneTime: false,
      active: false,
    },
  ]);
  expect(about.owner).toMatchObject({
    skoolUserId: "u-1",
    username: "yoga-yvonne",
    firstName: "Yvonne",
    bio: "Teacher",
    linkedinUrl: "https://linkedin.com/in/yvonne",
  });
});

test("a community page without an owner, survey or trial reports them as absent", async () => {
  stubFetch(() =>
    html({
      currentGroup: {
        id: "g-2",
        name: "plain",
        metadata: {
          surveyEnabled: 0,
          survey: JSON.stringify({ survey: [{ question: "?", type: "text" }] }),
        },
      },
    }),
  );

  const about = await scraper().about("plain");

  expect(about).toMatchObject({
    owner: null,
    freeTrialEnabled: false,
    membershipQuestions: [],
    tiers: [],
    freeBenefits: [],
    links: [],
    memberCount: 0,
    isPublic: false,
  });
});

test("a profile reads the counts and the communities the user created, and tolerates none", async () => {
  const requests = stubFetch((_url, call) =>
    html({
      currentUser: {
        id: "u-1",
        name: call === 1 ? "jane" : "joe",
        metadata: {
          bio: "Coach",
          linkWebsite: "https://jane.example.com",
          linkTiktok: "https://tiktok.com/@jane",
        },
        profileData:
          call === 1
            ? {
                totalPosts: 40,
                totalFollowers: 12,
                totalFollowing: 3,
                groupsCreatedByUser: [
                  {
                    id: "g-1",
                    name: "jane-club",
                    metadata: {
                      displayName: "Jane's Club",
                      totalMembers: 50,
                      displayPrice: JSON.stringify({
                        amount: 1000,
                        currency: "usd",
                      }),
                    },
                  },
                  { id: "g-2", name: "free-club", metadata: {} },
                ],
              }
            : { groupsCreatedByUser: null },
      },
    }),
  );

  const jane = await scraper().profile("jane");
  expect(requests[0]?.url).toBe("https://www.skool.com/@jane");
  expect(jane).toMatchObject({
    followerCount: 12,
    followingCount: 3,
    postCount: 40,
  });
  expect(jane.owner).toMatchObject({
    username: "jane",
    bio: "Coach",
    website: "https://jane.example.com",
    tiktokUrl: "https://tiktok.com/@jane",
  });
  expect(jane.ownedCommunities).toEqual([
    {
      skoolId: "g-1",
      name: "jane-club",
      displayName: "Jane's Club",
      url: "https://www.skool.com/jane-club",
      memberCount: 50,
      isPaid: true,
    },
    {
      skoolId: "g-2",
      name: "free-club",
      displayName: "free-club",
      url: "https://www.skool.com/free-club",
      memberCount: null,
      isPaid: false,
    },
  ]);

  const joe = await scraper().profile("joe");
  expect(joe.ownedCommunities).toEqual([]);
  expect(joe.followerCount).toBeNull();
});
