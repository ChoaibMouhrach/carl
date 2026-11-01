import type { LeadEmailVerification } from "@repo/constants/lead-emails";

export interface VerifiedEmail {
  address: string;
  verification: LeadEmailVerification;
}

export class EmailVerifierError extends Error {
  public readonly retryable: boolean;

  public constructor(input: {
    message: string;
    retryable: boolean;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "EmailVerifierError";
    this.retryable = input.retryable;
  }
}

export abstract class BaseEmailVerifier {
  /** Whether verifications actually reach a provider */
  public abstract readonly isAvailable: boolean;

  /** Returns one result per address given, in the same order */
  public abstract verify(input: {
    addresses: string[];
  }): Promise<VerifiedEmail[]>;
}
