import { ApifyApiError, ApifyClient } from "apify-client";
import { z } from "zod";
import type { LeadEmailVerification } from "@repo/constants/lead-emails";
import {
  BaseEmailVerifier,
  EmailVerifierError,
  type VerifiedEmail,
} from "@server/lib/base-email-verifier";

const ACTOR_ID = "bounceverify/bounceverify-email-verifier";
const WAIT_SECS = 180;
// The actor charges $0.00089 per email; the cap stops a price change or a runaway run from costing more.
const MAX_CHARGE_PER_EMAIL_USD = 0.002;
const MIN_CHARGE_CAP_USD = 0.01;
const RISKY_STATUSES = new Set([
  "risky",
  "catch_all",
  "catch-all",
  "accept_all",
]);

const resultSchema = z.object({
  email: z.string(),
  status: z.string().nullish(),
  is_catch_all: z.boolean().nullish(),
  is_disposable: z.boolean().nullish(),
  is_spamtrap: z.boolean().nullish(),
});

export interface ActorRunResult {
  status: string;
  items: unknown[];
}

export interface ActorRunner {
  run(input: {
    actorId: string;
    input: Record<string, unknown>;
    maxChargeUsd: number;
    waitSecs: number;
  }): Promise<ActorRunResult>;
}

export class ApifyActorRunner implements ActorRunner {
  private readonly client: ApifyClient;

  public constructor(init: {
    token: string;
    baseUrl?: string;
    maxRetries?: number;
  }) {
    this.client = new ApifyClient({
      token: init.token,
      baseUrl: init.baseUrl,
      maxRetries: init.maxRetries,
    });
  }

  public async run(input: {
    actorId: string;
    input: Record<string, unknown>;
    maxChargeUsd: number;
    waitSecs: number;
  }): Promise<ActorRunResult> {
    try {
      const run = await this.client.actor(input.actorId).call(input.input, {
        waitSecs: input.waitSecs,
        log: null,
        maxTotalChargeUsd: input.maxChargeUsd,
      });

      if (run.status === "RUNNING" || run.status === "READY") {
        // A run left going would charge again once the job is retried
        await this.client.run(run.id).abort();
        return { status: "TIMED-OUT", items: [] };
      }
      if (run.status !== "SUCCEEDED") {
        return { status: run.status, items: [] };
      }

      const { items } = await this.client
        .dataset(run.defaultDatasetId)
        .listItems();
      return { status: run.status, items };
    } catch (cause: unknown) {
      throw this.toError(cause);
    }
  }

  private toError(cause: unknown): EmailVerifierError {
    if (cause instanceof ApifyApiError) {
      const retryable = cause.statusCode === 429 || cause.statusCode >= 500;
      return new EmailVerifierError({
        message: `Apify answered HTTP ${cause.statusCode}: ${cause.message}`,
        retryable,
        cause,
      });
    }

    return new EmailVerifierError({
      message: `Apify could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`,
      retryable: true,
      cause,
    });
  }
}

interface ApifyEmailVerifierInit {
  runner: ActorRunner;
}

export class ApifyEmailVerifier extends BaseEmailVerifier {
  public override readonly isAvailable = true;
  private readonly runner: ActorRunner;

  public constructor(init: ApifyEmailVerifierInit) {
    super();
    this.runner = init.runner;
  }

  public override async verify(input: {
    addresses: string[];
  }): Promise<VerifiedEmail[]> {
    if (input.addresses.length === 0) return [];

    const result = await this.runner.run({
      actorId: ACTOR_ID,
      input: { emails: input.addresses, skipInvalidSyntax: true },
      maxChargeUsd: Math.max(
        MIN_CHARGE_CAP_USD,
        input.addresses.length * MAX_CHARGE_PER_EMAIL_USD,
      ),
      waitSecs: WAIT_SECS,
    });

    if (result.status !== "SUCCEEDED") {
      throw new EmailVerifierError({
        message: `The Apify email verifier run ended with status ${result.status}.`,
        retryable: result.status !== "ABORTED",
      });
    }

    const verdicts = new Map<string, LeadEmailVerification>();
    for (const item of result.items) {
      const parsed = resultSchema.safeParse(item);
      if (parsed.success) {
        verdicts.set(
          parsed.data.email.trim().toLowerCase(),
          this.toVerification(parsed.data),
        );
      }
    }

    return input.addresses.map((address) => ({
      address,
      verification: verdicts.get(address.trim().toLowerCase()) ?? "unknown",
    }));
  }

  /** Only a plain "valid" counts as valid, so anything the actor adds later fails safe */
  private toVerification(
    result: z.infer<typeof resultSchema>,
  ): LeadEmailVerification {
    if (result.is_disposable || result.is_spamtrap) return "invalid";

    const status = (result.status ?? "").trim().toLowerCase();

    if (status === "invalid") return "invalid";
    if (status === "valid") return result.is_catch_all ? "risky" : "valid";
    if (RISKY_STATUSES.has(status)) return "risky";

    return "unknown";
  }
}
