import { expect, test } from "bun:test";
import z from "zod";
import { FullEnrichEmailFinder } from "@server/infrastructure/email-finder/fullenrich";
import type { EmailLookup } from "@server/lib/base-email-finder";

interface Sent {
  method: string;
  url: string;
  authorization: string | null;
  body: unknown;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const lookups: EmailLookup[] = [
  {
    key: "a",
    firstName: "Jane",
    lastName: "Doe",
    domain: "example.com",
    linkedinUrl: "https://www.linkedin.com/in/jane",
  },
  {
    key: "b",
    firstName: null,
    lastName: null,
    domain: null,
    linkedinUrl: "https://www.linkedin.com/in/other",
  },
  {
    key: "c",
    firstName: "Sam",
    lastName: "Roe",
    domain: "roe.io",
    linkedinUrl: null,
  },
];

const finished = (
  records: { ref: string; email: string | null }[],
  status = "FINISHED",
) => ({
  status,
  data: records.map((record) => ({
    custom: { ref: record.ref },
    contact_info: record.email
      ? { most_probable_work_email: { email: record.email } }
      : null,
  })),
});

const createFinder = (
  responses: (() => Response)[],
  overrides: { pollTimeoutMs?: number } = {},
) => {
  const sent: Sent[] = [];
  const finder = new FullEnrichEmailFinder({
    apiKey: "fe-test-key",
    pollIntervalMs: 1,
    rateLimitWaitMs: 1,
    ...overrides,
    fetch: async (input, init) => {
      const next = responses.shift();
      if (!next) throw new Error("No response was prepared.");

      sent.push({
        method: init?.method ?? "GET",
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      });

      return next();
    },
  });

  return { finder, sent };
};

test("it starts one bulk enrichment for work emails with every field it has, then polls until it finishes and matches the emails back by position", async () => {
  const { finder, sent } = createFinder([
    () => json(200, { enrichment_id: "enr-1" }),
    () => json(200, { status: "IN_PROGRESS", data: [] }),
    () =>
      json(
        200,
        finished([
          { ref: "2", email: "sam@roe.io" },
          { ref: "0", email: "jane@example.com" },
          { ref: "1", email: null },
        ]),
      ),
  ]);

  const results = await finder.find(lookups);

  expect(results).toEqual([
    { key: "a", email: "jane@example.com" },
    { key: "b", email: null },
    { key: "c", email: "sam@roe.io" },
  ]);
  expect(sent.map((call) => [call.method, call.url])).toEqual([
    [
      "POST",
      "https://app.fullenrich.com/api/v2/contact/enrich/bulk?silentFail=true",
    ],
    ["GET", "https://app.fullenrich.com/api/v2/contact/enrich/bulk/enr-1"],
    ["GET", "https://app.fullenrich.com/api/v2/contact/enrich/bulk/enr-1"],
  ]);
  expect(
    sent.every((call) => call.authorization === "Bearer fe-test-key"),
  ).toBe(true);
  expect(
    z
      .object({
        name: z.string(),
        data: z.array(z.record(z.string(), z.unknown())),
      })
      .parse(sent[0]?.body).data,
  ).toEqual([
    {
      first_name: "Jane",
      last_name: "Doe",
      domain: "example.com",
      linkedin_url: "https://www.linkedin.com/in/jane",
      enrich_fields: ["contact.work_emails"],
      custom: { ref: "0" },
    },
    {
      linkedin_url: "https://www.linkedin.com/in/other",
      enrich_fields: ["contact.work_emails"],
      custom: { ref: "1" },
    },
    {
      first_name: "Sam",
      last_name: "Roe",
      domain: "roe.io",
      enrich_fields: ["contact.work_emails"],
      custom: { ref: "2" },
    },
  ]);
});

test("it makes no request for no lookups", async () => {
  const { finder, sent } = createFinder([]);

  expect(await finder.find([])).toEqual([]);
  expect(sent).toEqual([]);
});

test("a rate limit when starting is waited out and tried again, but only a few times", async () => {
  const limited = () =>
    json(429, { code: "error.rate.limit", message: "Too many requests." });
  const retried = createFinder([
    limited,
    () => json(200, { enrichment_id: "enr-2" }),
    () => json(200, finished([{ ref: "0", email: "a@example.com" }])),
  ]);

  const results = await retried.finder.find(lookups.slice(0, 1));

  expect(results).toEqual([{ key: "a", email: "a@example.com" }]);
  expect(retried.sent.map((call) => call.method)).toEqual([
    "POST",
    "POST",
    "GET",
  ]);

  const exhausted = createFinder([limited, limited, limited]);

  await expect(exhausted.finder.find(lookups)).rejects.toThrow(
    "FullEnrich 429: Too many requests.",
  );
  expect(exhausted.sent).toHaveLength(3);
});

test("a rejected key fails straight away with FullEnrich's message and is not retried", async () => {
  const { finder, sent } = createFinder([
    () => json(401, { code: "error.api.key", message: "Unknown api key" }),
  ]);

  await expect(finder.find(lookups)).rejects.toThrow(
    "FullEnrich 401: Unknown api key",
  );
  expect(sent).toHaveLength(1);
});

test("a failed poll is tried again, but not forever", async () => {
  const flaky = createFinder([
    () => json(200, { enrichment_id: "enr-3" }),
    () => json(502, { message: "bad gateway" }),
    () => json(200, finished([{ ref: "0", email: "a@example.com" }])),
  ]);

  expect(await flaky.finder.find(lookups.slice(0, 1))).toEqual([
    { key: "a", email: "a@example.com" },
  ]);

  const down = createFinder([
    () => json(200, { enrichment_id: "enr-4" }),
    ...Array.from({ length: 5 }, () => () => json(500, { message: "down" })),
  ]);

  await expect(down.finder.find(lookups)).rejects.toThrow(
    "FullEnrich 500: down",
  );
  expect(down.sent).toHaveLength(6);
});

test("an enrichment FullEnrich gave up on fails with a readable reason", async () => {
  const cases: [string, string][] = [
    ["CREDITS_INSUFFICIENT", "FullEnrich has no credits left."],
    ["RATE_LIMIT", "FullEnrich rate limit reached."],
    ["CANCELED", "FullEnrich stopped the enrichment (CANCELED)."],
  ];

  for (const [status, message] of cases) {
    const { finder, sent } = createFinder([
      () => json(200, { enrichment_id: "enr-5" }),
      () => json(200, { status, data: [] }),
    ]);

    await expect(finder.find(lookups)).rejects.toThrow(message);
    expect(sent).toHaveLength(2);
  }
});

test("it gives up when the enrichment never finishes", async () => {
  const { finder } = createFinder(
    [
      () => json(200, { enrichment_id: "enr-6" }),
      ...Array.from(
        { length: 200 },
        () => () => json(200, { status: "IN_PROGRESS", data: [] }),
      ),
    ],
    { pollTimeoutMs: 30 },
  );

  await expect(finder.find(lookups)).rejects.toThrow(
    "FullEnrich took too long to answer.",
  );
});

test("records without a reference are matched by position, and lookups with no record get no email", async () => {
  const { finder } = createFinder([
    () => json(200, { enrichment_id: "enr-7" }),
    () =>
      json(200, {
        status: "FINISHED",
        data: [
          {
            contact_info: {
              most_probable_work_email: { email: "first@example.com" },
            },
          },
          { contact_info: { most_probable_work_email: { email: null } } },
        ],
      }),
  ]);

  const results = await finder.find(lookups);

  expect(results).toEqual([
    { key: "a", email: "first@example.com" },
    { key: "b", email: null },
    { key: "c", email: null },
  ]);
});

test("a finished enrichment with no data at all finds nothing for every lookup", async () => {
  const { finder } = createFinder([
    () => json(200, { enrichment_id: "enr-8" }),
    () => json(200, { status: "FINISHED" }),
  ]);

  expect(await finder.find(lookups)).toEqual([
    { key: "a", email: null },
    { key: "b", email: null },
    { key: "c", email: null },
  ]);
});
