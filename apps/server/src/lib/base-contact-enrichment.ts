export interface ContactEnrichmentInput {
  firstName: string;
  lastName: string;
  domain?: string;
  companyName?: string;
  linkedinUrl?: string;
}

export interface ContactEmail {
  address: string;
  status: string;
}

export interface ContactEnrichmentResult {
  workEmail: ContactEmail | null;
  personalEmail: ContactEmail | null;
}

export class ContactEnrichmentError extends Error {
  public readonly retryable: boolean;

  public constructor(input: {
    message: string;
    retryable: boolean;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "ContactEnrichmentError";
    this.retryable = input.retryable;
  }
}

export abstract class BaseContactEnrichment {
  /** Whether enrichments actually reach a provider */
  public abstract readonly isAvailable: boolean;

  public abstract enrich(
    input: ContactEnrichmentInput,
  ): Promise<ContactEnrichmentResult>;
}
