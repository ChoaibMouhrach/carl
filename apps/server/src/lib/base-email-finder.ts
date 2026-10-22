export interface EmailLookup {
  key: string;
  firstName: string | null;
  lastName: string | null;
  domain: string | null;
  linkedinUrl: string | null;
}

export interface EmailLookupResult {
  key: string;
  email: string | null;
}

export abstract class BaseEmailFinder {
  public abstract readonly provider: string;

  /** Answers every lookup it is given, with a null email when none was found */
  public abstract find(lookups: EmailLookup[]): Promise<EmailLookupResult[]>;
}
