export interface EmailLookup {
  firstName: string | null;
  lastName: string | null;
  domain: string | null;
  linkedinUrl: string | null;
}

export interface EmailBatchResult {
  /** The position of the lookup in the batch it was sent in */
  ref: number;
  email: string | null;
}

export interface EmailBatchSnapshot {
  providerId: string | null;
  batchId: string | null;
  /** waiting: results so far; finished: nothing more will come; failed: the provider gave up, with the reason */
  state: "waiting" | "finished" | "failed";
  reason: string | null;
  results: EmailBatchResult[];
}

export interface EmailBatchStart {
  providerId: string;
  /** Set when the provider already has the answer */
  snapshot: EmailBatchSnapshot | null;
}

export abstract class BaseEmailFinder {
  public abstract readonly provider: string;

  /** Starts a batch without waiting for it; the answer is fetched later */
  public abstract start(input: {
    batchId: string;
    lookups: EmailLookup[];
  }): Promise<EmailBatchStart>;

  public abstract fetch(providerId: string): Promise<EmailBatchSnapshot>;
}
