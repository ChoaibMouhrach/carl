import { z } from "zod";
import {
  BaseContactEnrichment,
  ContactEnrichmentError,
  type ContactEmail,
  type ContactEnrichmentInput,
  type ContactEnrichmentResult,
} from "@server/lib/base-contact-enrichment";
import { sleep } from "@server/lib/utils";

const BASE_URL = "https://app.fullenrich.com/api/v2";
const REQUEST_TIMEOUT_MS = 30_000;
// Enrichments take 30-90s and the API allows 60 calls/min per workspace, so poll sparingly.
const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_INITIAL_DELAY_MS = 30_000;
const DEFAULT_MAX_WAIT_MS = 300_000;
const ENRICH_FIELDS = ["contact.work_emails", "contact.personal_emails"];
const UNUSABLE_EMAIL_STATUSES = new Set(["INVALID", "INVALID_DOMAIN"]);
const IN_PROGRESS_CODE = "error.enrichment.in_progress";

const errorBodySchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

const startResponseSchema = z.object({ enrichment_id: z.string() });

const emailSchema = z.object({
  email: z.string(),
  status: z.string().optional(),
});

const contactInfoSchema = z.object({
  most_probable_work_email: emailSchema.nullish(),
  most_probable_personal_email: emailSchema.nullish(),
  work_emails: z.array(emailSchema).nullish(),
  personal_emails: z.array(emailSchema).nullish(),
});

const resultResponseSchema = z.object({
  status: z.string(),
  data: z
    .array(z.object({ contact_info: contactInfoSchema.nullish() }))
    .nullish(),
});

type FullEnrichEmail = z.infer<typeof emailSchema>;

interface FullEnrichContactEnrichmentInit {
  apiKey: string;
  initialDelayMs?: number;
  pollIntervalMs?: number;
  maxWaitMs?: number;
}

export class FullEnrichContactEnrichment extends BaseContactEnrichment {
  public override readonly isAvailable = true;
  private readonly apiKey: string;
  private readonly initialDelayMs: number;
  private readonly pollIntervalMs: number;
  private readonly maxWaitMs: number;

  public constructor(init: FullEnrichContactEnrichmentInit) {
    super();
    this.apiKey = init.apiKey;
    this.initialDelayMs = init.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    this.pollIntervalMs = init.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxWaitMs = init.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  }

  public override async enrich(
    input: ContactEnrichmentInput,
  ): Promise<ContactEnrichmentResult> {
    this.assertEnrichable(input);
    const enrichmentId = await this.startEnrichment(input);
    return this.waitForResult(enrichmentId);
  }

  private assertEnrichable(input: ContactEnrichmentInput) {
    if (input.linkedinUrl) return;

    const missing = [
      !input.firstName && "first name",
      !input.lastName && "last name",
      !input.domain && !input.companyName && "domain or company name",
    ].filter((part) => part !== false);
    if (missing.length === 0) return;

    throw new ContactEnrichmentError({
      message: `FullEnrich was not called: no LinkedIn URL was given and the lead is missing ${missing.join(", ")}.`,
      retryable: false,
    });
  }

  private describeIssues(error: z.ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
  }

  private async startEnrichment(input: ContactEnrichmentInput) {
    const body = await this.request({
      method: "POST",
      path: "/contact/enrich/bulk",
      payload: {
        name: `${input.firstName} ${input.lastName}`.trim(),
        data: [
          {
            first_name: input.firstName,
            last_name: input.lastName,
            domain: input.domain,
            company_name: input.companyName,
            linkedin_url: input.linkedinUrl,
            enrich_fields: ENRICH_FIELDS,
          },
        ],
      },
    });

    const parsed = startResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new ContactEnrichmentError({
        message: `FullEnrich accepted the enrichment request but the response had no usable enrichment_id (${this.describeIssues(parsed.error)}).`,
        retryable: true,
        cause: parsed.error,
      });
    }

    return parsed.data.enrichment_id;
  }

  private async waitForResult(
    enrichmentId: string,
  ): Promise<ContactEnrichmentResult> {
    const deadline = Date.now() + this.maxWaitMs;
    let delayMs = this.initialDelayMs;
    let lastStatus = "no response yet";

    while (Date.now() < deadline) {
      await sleep(delayMs);
      delayMs = this.pollIntervalMs;

      const body = await this.request({
        method: "GET",
        path: `/contact/enrich/bulk/${encodeURIComponent(enrichmentId)}`,
        keepPolling: true,
      });
      if (body === null) {
        lastStatus = "still running or rate limited";
        continue;
      }

      const parsed = resultResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new ContactEnrichmentError({
          message: `FullEnrich enrichment ${enrichmentId} returned a result in an unexpected shape (${this.describeIssues(parsed.error)}).`,
          retryable: true,
          cause: parsed.error,
        });
      }

      lastStatus = parsed.data.status;

      switch (parsed.data.status) {
        case "FINISHED":
          return this.toResult(parsed.data);
        case "CREATED":
        case "IN_PROGRESS":
          continue;
        case "CREDITS_INSUFFICIENT":
          throw new ContactEnrichmentError({
            message: `FullEnrich enrichment ${enrichmentId} stopped because the FullEnrich account is out of credits. Top up credits to continue.`,
            retryable: false,
          });
        case "CANCELED":
          throw new ContactEnrichmentError({
            message: `FullEnrich enrichment ${enrichmentId} was canceled on the FullEnrich side.`,
            retryable: false,
          });
        case "RATE_LIMIT":
          throw new ContactEnrichmentError({
            message: `FullEnrich enrichment ${enrichmentId} was stopped by FullEnrich's rate limit (status RATE_LIMIT). It can be retried later.`,
            retryable: true,
          });
        default:
          throw new ContactEnrichmentError({
            message: `FullEnrich enrichment ${enrichmentId} ended with an unexpected status "${parsed.data.status}".`,
            retryable: true,
          });
      }
    }

    throw new ContactEnrichmentError({
      message: `FullEnrich enrichment ${enrichmentId} did not finish within ${this.maxWaitMs / 1000}s (last status: ${lastStatus}). It may still complete on FullEnrich's side.`,
      retryable: true,
    });
  }

  private toResult(
    response: z.infer<typeof resultResponseSchema>,
  ): ContactEnrichmentResult {
    const info = response.data?.at(0)?.contact_info;

    return {
      workEmail: this.pickEmail(
        info?.most_probable_work_email,
        info?.work_emails,
      ),
      personalEmail: this.pickEmail(
        info?.most_probable_personal_email,
        info?.personal_emails,
      ),
    };
  }

  private pickEmail(
    best: FullEnrichEmail | null | undefined,
    all: FullEnrichEmail[] | null | undefined,
  ): ContactEmail | null {
    const candidate = [best, ...(all ?? [])].find(
      (email) =>
        email !== null &&
        email !== undefined &&
        email.email !== "" &&
        !UNUSABLE_EMAIL_STATUSES.has(email.status ?? ""),
    );

    if (!candidate) return null;

    return { address: candidate.email, status: candidate.status ?? "UNKNOWN" };
  }

  /** Returns null only when `keepPolling` is set and the enrichment is still running or rate limited. */
  private async request(input: {
    method: "GET" | "POST";
    path: string;
    payload?: unknown;
    keepPolling?: boolean;
  }): Promise<unknown> {
    const call = `${input.method} ${input.path}`;
    let response: Response;

    try {
      response = await fetch(`${BASE_URL}${input.path}`, {
        method: input.method,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body:
          input.payload === undefined
            ? undefined
            : JSON.stringify(input.payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (cause: unknown) {
      const timedOut = cause instanceof Error && cause.name === "TimeoutError";
      const detail = cause instanceof Error ? cause.message : String(cause);
      const reason = timedOut
        ? `timed out after ${REQUEST_TIMEOUT_MS / 1000}s without an answer`
        : `could not reach FullEnrich (${detail})`;

      throw new ContactEnrichmentError({
        message: `FullEnrich ${call} ${reason}.`,
        retryable: true,
        cause,
      });
    }

    const rawBody = await response.text();

    if (response.ok) {
      try {
        const body: unknown = JSON.parse(rawBody);
        return body;
      } catch (cause: unknown) {
        throw new ContactEnrichmentError({
          message: `FullEnrich ${call} answered HTTP ${response.status} but the body was not valid JSON: ${this.excerpt(rawBody)}`,
          retryable: true,
          cause,
        });
      }
    }

    const error = this.parseError(rawBody);

    const stillRunning =
      error.code === IN_PROGRESS_CODE || response.status === 429;
    if (input.keepPolling && stillRunning) return null;

    const code = error.code ? ` [${error.code}]` : "";
    const detail = error.message ?? this.excerpt(rawBody);

    throw new ContactEnrichmentError({
      message: `FullEnrich ${call} failed with HTTP ${response.status}${code}: ${detail}. ${this.explainStatus(response.status)}`,
      retryable: this.isRetryableStatus(response.status),
    });
  }

  private parseError(rawBody: string) {
    try {
      const body: unknown = JSON.parse(rawBody);
      const parsed = errorBodySchema.safeParse(body);
      return parsed.success ? parsed.data : {};
    } catch {
      return {};
    }
  }

  private excerpt(rawBody: string) {
    const trimmed = rawBody.trim();
    if (trimmed === "") return "(empty body)";

    return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
  }

  private explainStatus(status: number) {
    if (status === 401) {
      return "The FULLENRICH_API_KEY is missing or invalid; this will not succeed on retry.";
    }
    if (status === 402) {
      return "The FullEnrich account is out of credits; this will not succeed on retry.";
    }
    if (status === 429) {
      return "FullEnrich rate limit (60 calls/min per workspace) was hit; it will be retried.";
    }
    if (status >= 500) {
      return "FullEnrich had a server-side problem; it will be retried.";
    }
    if (status === 400) {
      return "FullEnrich rejected the request input; this will not succeed on retry.";
    }

    return this.isRetryableStatus(status)
      ? "It will be retried."
      : "This will not succeed on retry.";
  }

  private isRetryableStatus(status: number) {
    return status === 408 || status === 429 || status >= 500;
  }
}
