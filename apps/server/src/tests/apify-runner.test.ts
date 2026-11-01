import { afterAll, beforeAll, expect, test } from "bun:test";
import { ApifyActorRunner } from "@server/infrastructure/email-verifier/apify";
import { EmailVerifierError } from "@server/lib/base-email-verifier";

interface Request {
  method: string;
  path: string;
  query: URLSearchParams;
  authorization: string | null;
  body: unknown;
}

const run = (status: string) => ({
  id: "run-1",
  actId: "actor-1",
  userId: "user-1",
  startedAt: "2026-11-01T00:00:00.000Z",
  finishedAt: status === "RUNNING" ? undefined : "2026-11-01T00:00:05.000Z",
  status,
  meta: { origin: "API" },
  stats: {},
  options: { build: "latest", timeoutSecs: 300, memoryMbytes: 256 },
  buildId: "build-1",
  defaultKeyValueStoreId: "store-1",
  defaultDatasetId: "dataset-1",
  defaultRequestQueueId: "queue-1",
  containerUrl: "https://run-1.runs.apify.net",
});

let runStatus = "SUCCEEDED";
let items: unknown[] = [];
let failWith: number | null = null;
let requests: Request[] = [];
let server: ReturnType<typeof Bun.serve>;

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers });

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const text = await request.text();
      requests.push({
        method: request.method,
        path: url.pathname,
        query: url.searchParams,
        authorization: request.headers.get("authorization"),
        body: text ? JSON.parse(text) : null,
      });

      if (failWith !== null) {
        return json(
          { error: { type: "failure", message: "Apify said no" } },
          failWith,
        );
      }
      if (url.pathname.endsWith("/runs") && request.method === "POST") {
        return json({ data: run(runStatus) }, 201);
      }
      if (url.pathname.endsWith("/abort")) {
        return json({ data: run("ABORTING") });
      }
      if (url.pathname.startsWith("/v2/actor-runs/")) {
        return json({ data: run(runStatus) });
      }
      if (url.pathname.includes("/datasets/")) {
        return json(items, 200, {
          "x-apify-pagination-offset": "0",
          "x-apify-pagination-limit": String(items.length),
          "x-apify-pagination-count": String(items.length),
          "x-apify-pagination-total": String(items.length),
        });
      }

      return json({ error: { type: "record-not-found" } }, 404);
    },
  });
});

afterAll(() => server.stop(true));

const runner = () =>
  new ApifyActorRunner({
    token: "test-token",
    baseUrl: `http://localhost:${server.port}`,
    maxRetries: 0,
  });

const input = {
  actorId: "bounceverify/bounceverify-email-verifier",
  input: { emails: ["ann@coach.com"], skipInvalidSyntax: true },
  maxChargeUsd: 0.01,
  waitSecs: 5,
};

const reset = (next: { status?: string; items?: unknown[] } = {}) => {
  runStatus = next.status ?? "SUCCEEDED";
  items = next.items ?? [];
  failWith = null;
  requests = [];
};

test("a finished run returns its dataset items after one start call with the token, the input and the spend cap", async () => {
  reset({ items: [{ email: "ann@coach.com", status: "valid" }] });

  const result = await runner().run(input);

  expect(result).toEqual({
    status: "SUCCEEDED",
    items: [{ email: "ann@coach.com", status: "valid" }],
  });
  const starts = requests.filter((request) => request.method === "POST");
  expect(starts).toHaveLength(1);
  expect(starts[0]?.path).toBe(
    "/v2/actors/bounceverify~bounceverify-email-verifier/runs",
  );
  expect(starts[0]?.body).toEqual(input.input);
  expect(starts[0]?.query.get("maxTotalChargeUsd")).toBe("0.01");
  expect(starts[0]?.authorization).toBe("Bearer test-token");
});

test("a run that failed returns its status and reads no dataset", async () => {
  reset({ status: "FAILED" });

  const result = await runner().run(input);

  expect(result).toEqual({ status: "FAILED", items: [] });
  expect(requests.some((request) => request.path.includes("/datasets/"))).toBe(
    false,
  );
});

test("a run still going after the wait is aborted so a retry cannot pay twice", async () => {
  reset({ status: "RUNNING" });

  const result = await runner().run({ ...input, waitSecs: 1 });

  expect(result).toEqual({ status: "TIMED-OUT", items: [] });
  expect(
    requests.filter((request) => request.path.endsWith("/abort")),
  ).toHaveLength(1);
});

const apiFailures: { status: number; retryable: boolean }[] = [
  { status: 401, retryable: false },
  { status: 402, retryable: false },
  { status: 403, retryable: false },
  { status: 429, retryable: true },
  { status: 500, retryable: true },
];

for (const scenario of apiFailures) {
  test(`Apify answering HTTP ${scenario.status} is an error that ${scenario.retryable ? "can" : "cannot"} be retried`, async () => {
    reset();
    failWith = scenario.status;

    const error = await runner()
      .run(input)
      .then(
        () => null,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(EmailVerifierError);
    expect(error).toMatchObject({ retryable: scenario.retryable });
    expect(
      requests.filter((request) => request.method === "POST"),
    ).toHaveLength(1);
  });
}

test("an unreachable Apify is a retryable error", async () => {
  const unreachable = new ApifyActorRunner({
    token: "test-token",
    baseUrl: "http://localhost:1",
    maxRetries: 0,
  });

  const error = await unreachable.run(input).then(
    () => null,
    (reason: unknown) => reason,
  );

  expect(error).toBeInstanceOf(EmailVerifierError);
  expect(error).toMatchObject({ retryable: true });
});
