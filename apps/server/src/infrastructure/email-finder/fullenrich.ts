import z from "zod";
import {
  BaseEmailFinder,
  type EmailBatchSnapshot,
  type EmailBatchStart,
  type EmailLookup,
} from "@server/lib/base-email-finder";

const BASE_URL = "https://app.fullenrich.com/api/v2";
const MAX_START_ATTEMPTS = 3;
const RATE_LIMIT_WAIT_MS = 20_000;
const FINISHED = "FINISHED";
const WAITING = ["CREATED", "IN_PROGRESS"];

const startSchema = z.object({ enrichment_id: z.string() });

const resultSchema = z.object({
  id: z.string().nullish(),
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
  rateLimitWaitMs?: number;
}

class FullEnrichError extends Error {
  public readonly status: number | undefined;

  public constructor(message: string, status?: number) {
    super(message);

    this.status = status;
  }
}

const describeStatus = (status: string) => {
  if (status === "CREDITS_INSUFFICIENT")
    return "FullEnrich has no credits left.";

  if (status === "RATE_LIMIT") return "FullEnrich rate limit reached.";

  return `FullEnrich stopped the enrichment (${status}).`;
};

export class FullEnrichEmailFinder extends BaseEmailFinder {
  public readonly provider = "fullenrich";

  private readonly apiKey: string;
  private readonly request: typeof fetch;
  private readonly rateLimitWaitMs: number;

  public constructor(init: FullEnrichEmailFinderInit) {
    super();

    this.apiKey = init.apiKey;
    this.request = init.fetch ?? fetch;
    this.rateLimitWaitMs = init.rateLimitWaitMs ?? RATE_LIMIT_WAIT_MS;
  }

  public override async start(input: {
    batchId: string;
    lookups: EmailLookup[];
  }): Promise<EmailBatchStart> {
    const body = {
      name: `Carl ${new Date().toISOString()}`,
      data: input.lookups.map((lookup, index) => ({
        first_name: lookup.firstName ?? undefined,
        last_name: lookup.lastName ?? undefined,
        domain: lookup.domain ?? undefined,
        linkedin_url: lookup.linkedinUrl ?? undefined,
        enrich_fields: ["contact.work_emails"],
        custom: { batch: input.batchId, ref: String(index) },
      })),
    };

    for (let attempt = 1; ; attempt += 1) {
      try {
        const response = await this.call(
          "POST",
          "/contact/enrich/bulk?silentFail=true",
          body,
        );

        return {
          providerId: startSchema.parse(response).enrichment_id,
          snapshot: null,
        };
      } catch (error) {
        const rateLimited =
          error instanceof FullEnrichError && error.status === 429;

        if (!rateLimited || attempt >= MAX_START_ATTEMPTS) throw error;

        await new Promise((resolve) =>
          setTimeout(resolve, this.rateLimitWaitMs),
        );
      }
    }
  }

  public override async fetch(providerId: string): Promise<EmailBatchSnapshot> {
    const response = await this.call(
      "GET",
      `/contact/enrich/bulk/${encodeURIComponent(providerId)}`,
    );

    return this.toSnapshot(resultSchema.parse(response), providerId);
  }

  private toSnapshot(
    result: z.infer<typeof resultSchema>,
    providerId: string | null,
  ): EmailBatchSnapshot {
    const records = result.data ?? [];
    const batchId = records
      .map((record) => record.custom?.["batch"])
      .find((value) => typeof value === "string");
    const state =
      result.status === FINISHED
        ? "finished"
        : WAITING.includes(result.status)
          ? "waiting"
          : "failed";

    return {
      providerId,
      batchId: typeof batchId === "string" ? batchId : null,
      state,
      reason: state === "failed" ? describeStatus(result.status) : null,
      results: records.map((record, index) => {
        const ref = Number(record.custom?.["ref"] ?? index);

        return {
          ref: Number.isInteger(ref) ? ref : index,
          email: record.contact_info?.most_probable_work_email?.email ?? null,
        };
      }),
    };
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
