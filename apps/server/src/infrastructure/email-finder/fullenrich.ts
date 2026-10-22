import { setTimeout as sleep } from "node:timers/promises";
import z from "zod";
import {
  BaseEmailFinder,
  type EmailLookup,
  type EmailLookupResult,
} from "@server/lib/base-email-finder";

const BASE_URL = "https://app.fullenrich.com/api/v2";
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 15 * 60_000;
const MAX_POLL_FAILURES = 5;
const MAX_START_ATTEMPTS = 3;
const RATE_LIMIT_WAIT_MS = 20_000;
const FINISHED = "FINISHED";
const WAITING = ["CREATED", "IN_PROGRESS"];

const startSchema = z.object({ enrichment_id: z.string() });

const resultSchema = z.object({
  status: z.string(),
  data: z
    .array(
      z.object({
        custom: z.record(z.string(), z.unknown()).nullish(),
        contact_info: z
          .object({
            most_probable_work_email: z
              .object({ email: z.string().nullish() })
              .nullish(),
          })
          .nullish(),
      }),
    )
    .nullish(),
});

const errorSchema = z.object({ message: z.string() });

interface FullEnrichEmailFinderInit {
  apiKey: string;
  fetch?: typeof fetch;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  rateLimitWaitMs?: number;
}

class FullEnrichError extends Error {
  public readonly status: number | undefined;

  public constructor(message: string, status?: number) {
    super(message);

    this.status = status;
  }

  public get retryable() {
    return this.status === 429 || (this.status ?? 0) >= 500;
  }
}

export class FullEnrichEmailFinder extends BaseEmailFinder {
  public readonly provider = "fullenrich";

  private readonly apiKey: string;
  private readonly request: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  private readonly rateLimitWaitMs: number;

  public constructor(init: FullEnrichEmailFinderInit) {
    super();

    this.apiKey = init.apiKey;
    this.request = init.fetch ?? fetch;
    this.pollIntervalMs = init.pollIntervalMs ?? POLL_INTERVAL_MS;
    this.pollTimeoutMs = init.pollTimeoutMs ?? POLL_TIMEOUT_MS;
    this.rateLimitWaitMs = init.rateLimitWaitMs ?? RATE_LIMIT_WAIT_MS;
  }

  public override async find(
    lookups: EmailLookup[],
  ): Promise<EmailLookupResult[]> {
    if (lookups.length === 0) return [];

    const enrichmentId = await this.start(lookups);
    const result = await this.waitForResult(enrichmentId);
    const found = new Map<string, string>();

    for (const [index, record] of (result.data ?? []).entries()) {
      const position = Number(record.custom?.["ref"] ?? index);
      const lookup = lookups[position];
      const email = record.contact_info?.most_probable_work_email?.email;

      if (lookup && email) found.set(lookup.key, email);
    }

    return lookups.map((lookup) => ({
      key: lookup.key,
      email: found.get(lookup.key) ?? null,
    }));
  }

  private async start(lookups: EmailLookup[]) {
    const body = {
      name: `Carl ${new Date().toISOString()}`,
      data: lookups.map((lookup, index) => ({
        first_name: lookup.firstName ?? undefined,
        last_name: lookup.lastName ?? undefined,
        domain: lookup.domain ?? undefined,
        linkedin_url: lookup.linkedinUrl ?? undefined,
        enrich_fields: ["contact.work_emails"],
        custom: { ref: String(index) },
      })),
    };

    for (let attempt = 1; ; attempt += 1) {
      try {
        const response = await this.call(
          "POST",
          "/contact/enrich/bulk?silentFail=true",
          body,
        );

        return startSchema.parse(response).enrichment_id;
      } catch (error) {
        const rateLimited =
          error instanceof FullEnrichError && error.status === 429;

        if (!rateLimited || attempt >= MAX_START_ATTEMPTS) throw error;

        await sleep(this.rateLimitWaitMs);
      }
    }
  }

  private async waitForResult(enrichmentId: string) {
    const deadline = Date.now() + this.pollTimeoutMs;
    let failures = 0;

    while (Date.now() < deadline) {
      await sleep(this.pollIntervalMs);

      try {
        const response = await this.call(
          "GET",
          `/contact/enrich/bulk/${encodeURIComponent(enrichmentId)}`,
        );
        const result = resultSchema.parse(response);

        failures = 0;

        if (result.status === FINISHED) return result;

        if (!WAITING.includes(result.status)) {
          throw new FullEnrichError(this.describeStatus(result.status));
        }
      } catch (error) {
        const fatal = error instanceof FullEnrichError && !error.retryable;

        failures += 1;

        if (fatal || failures >= MAX_POLL_FAILURES) throw error;
      }
    }

    throw new FullEnrichError(
      "FullEnrich took too long to answer. The same leads can be run again without being charged twice.",
    );
  }

  private describeStatus(status: string) {
    if (status === "CREDITS_INSUFFICIENT") {
      return "FullEnrich has no credits left.";
    }

    if (status === "RATE_LIMIT") return "FullEnrich rate limit reached.";

    return `FullEnrich stopped the enrichment (${status}).`;
  }

  private async call(method: "GET" | "POST", path: string, body?: object) {
    const response = await this.request(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload: unknown = await response.json().catch(() => null);

    if (response.ok) return payload;

    const detail = errorSchema.safeParse(payload);

    throw new FullEnrichError(
      `FullEnrich ${response.status}: ${detail.success ? detail.data.message : response.statusText}`,
      response.status,
    );
  }
}
