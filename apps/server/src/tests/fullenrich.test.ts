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

const API_KEY = "fe-test-key";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const lookups: EmailLookup[] = [
  {
    firstName: "Jane",
    lastName: "Doe",
    domain: "example.com",
    linkedinUrl: "https://www.linkedin.com/in/jane",
  },
  {
    firstName: null,
    lastName: null,
    domain: null,
    linkedinUrl: "https://www.linkedin.com/in/other",
  },
  {
    firstName: "Sam",
    lastName: "Roe",
    domain: "roe.io",
    linkedinUrl: null,
  },
];

const record = (
  ref: string | null,
  email: string | null,
  batch = "batch-1",
) => ({
  custom: ref === null ? null : { batch, ref },
  contact_info: email
    ? { most_probable_work_email: { email, status: "DELIVERABLE" } }
    : null,
});

const createFinder = (responses: (() => Response)[]) => {
  const sent: Sent[] = [];
  const finder = new FullEnrichEmailFinder({
    apiKey: API_KEY,
    rateLimitWaitMs: 1,
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

test("it starts one bulk enrichment for work emails with every field it has, our batch id and a position on each contact, and no webhook", async () => {
  const { finder, sent } = createFinder([
    () => json(200, { enrichment_id: "enr-1" }),
  ]);

  const started = await finder.start({ batchId: "batch-1", lookups });

  expect(started).toEqual({ providerId: "enr-1", snapshot: null });
  expect(sent).toHaveLength(1);
  expect([sent[0]?.method, sent[0]?.url, sent[0]?.authorization]).toEqual([
    "POST",
    "https://app.fullenrich.com/api/v2/contact/enrich/bulk?silentFail=true",
    "Bearer fe-test-key",
  ]);
  const body = z
    .object({ data: z.array(z.record(z.string(), z.unknown())) })
    .parse(sent[0]?.body);
  expect(
    Object.keys(z.record(z.string(), z.unknown()).parse(sent[0]?.body)),
  ).toEqual(["name", "data"]);
  expect(body.data).toEqual([
    {
      first_name: "Jane",
      last_name: "Doe",
      domain: "example.com",
      linkedin_url: "https://www.linkedin.com/in/jane",
      enrich_fields: ["contact.work_emails"],
      custom: { batch: "batch-1", ref: "0" },
    },
    {
      linkedin_url: "https://www.linkedin.com/in/other",
      enrich_fields: ["contact.work_emails"],
      custom: { batch: "batch-1", ref: "1" },
    },
    {
      first_name: "Sam",
      last_name: "Roe",
      domain: "roe.io",
      enrich_fields: ["contact.work_emails"],
      custom: { batch: "batch-1", ref: "2" },
    },
  ]);
});

test("a rate limit when starting is waited out and tried again, but only a few times", async () => {
  const limited = () =>
    json(429, { code: "error.rate.limit", message: "Too many requests." });
  const retried = createFinder([
    limited,
    () => json(200, { enrichment_id: "enr-3" }),
  ]);

  const started = await retried.finder.start({
    batchId: "b",
    lookups,
  });

  expect(started.providerId).toBe("enr-3");
  expect(retried.sent).toHaveLength(2);

  const exhausted = createFinder([limited, limited, limited]);

  await expect(
    exhausted.finder.start({ batchId: "b", lookups }),
  ).rejects.toThrow("FullEnrich 429: Too many requests.");
  expect(exhausted.sent).toHaveLength(3);
});

test("a rejected key fails straight away with FullEnrich's message and is not retried", async () => {
  const { finder, sent } = createFinder([
    () => json(401, { code: "error.api.key", message: "Unknown api key" }),
  ]);

  await expect(finder.start({ batchId: "b", lookups })).rejects.toThrow(
    "FullEnrich 401: Unknown api key",
  );
  expect(sent).toHaveLength(1);
});

test("fetching a batch reads its emails by position, our batch id and its state", async () => {
  const { finder, sent } = createFinder([
    () =>
      json(200, {
        id: "enr-4",
        status: "FINISHED",
        data: [
          record("2", "sam@roe.io"),
          record("0", "jane@example.com"),
          record("1", null),
        ],
      }),
  ]);

  const snapshot = await finder.fetch("enr-4");

  expect(sent[0]?.url).toBe(
    "https://app.fullenrich.com/api/v2/contact/enrich/bulk/enr-4",
  );
  expect(snapshot).toEqual({
    providerId: "enr-4",
    batchId: "batch-1",
    state: "finished",
    reason: null,
    results: [
      { ref: 2, email: "sam@roe.io" },
      { ref: 0, email: "jane@example.com" },
      { ref: 1, email: null },
    ],
  });
});

test("a batch that is not done is waiting, and one FullEnrich gave up on has a readable reason", async () => {
  const cases: [string, "waiting" | "failed", string | null][] = [
    ["CREATED", "waiting", null],
    ["IN_PROGRESS", "waiting", null],
    ["CREDITS_INSUFFICIENT", "failed", "FullEnrich has no credits left."],
    ["RATE_LIMIT", "failed", "FullEnrich rate limit reached."],
    ["CANCELED", "failed", "FullEnrich stopped the enrichment (CANCELED)."],
  ];

  for (const [status, state, reason] of cases) {
    const { finder } = createFinder([
      () => json(200, { id: "enr-5", status, data: [] }),
    ]);

    expect(await finder.fetch("enr-5")).toMatchObject({ state, reason });
  }
});

test("records without a reference are matched by position and a response with no data has no results", async () => {
  const unnumbered = createFinder([
    () =>
      json(200, {
        status: "FINISHED",
        data: [record(null, "first@example.com"), record(null, null)],
      }),
  ]);
  const empty = createFinder([() => json(200, { status: "FINISHED" })]);

  expect((await unnumbered.finder.fetch("x")).results).toEqual([
    { ref: 0, email: "first@example.com" },
    { ref: 1, email: null },
  ]);
  expect((await empty.finder.fetch("y")).results).toEqual([]);
});

test("a failed fetch fails with FullEnrich's message", async () => {
  const { finder } = createFinder([() => json(500, { message: "down" })]);

  await expect(finder.fetch("enr-6")).rejects.toThrow("FullEnrich 500: down");
});
