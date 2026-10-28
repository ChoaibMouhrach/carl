export type Pricing =
  | { type: "free" }
  | {
      type: "paid";
      amountCents: number;
      currency: string;
      interval: "month" | "year" | "one_time";
      source: "displayPrice" | "legacy";
    };

export type Community = {
  name: string;
  communityURL: string;
  description: string | null;
  members: number;
  pricing: Pricing;
  mrr: number;
  email: string | null;
  thumbnailUrl: string | null;
  logoUrl: string | null;
};

export type FullCommunity = Community & {
  leadURL: string;
};

export type FullLead = {
  name: string;
  username: string;
  leadURL: string;
  bio: string | null;
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  website: string | null;
  email: string | null;
  pictureUrl: string | null;
};

export type SkoolScrapeErrorKind =
  | "blocked"
  | "rate_limited"
  | "upstream"
  | "parse"
  | "invalid_input";

const RETRYABLE_KINDS: SkoolScrapeErrorKind[] = [
  "blocked",
  "rate_limited",
  "upstream",
];

export class SkoolScrapeError extends Error {
  public readonly kind: SkoolScrapeErrorKind;
  public readonly retryable: boolean;

  public constructor(input: {
    kind: SkoolScrapeErrorKind;
    message: string;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "SkoolScrapeError";
    this.kind = input.kind;
    this.retryable = RETRYABLE_KINDS.includes(input.kind);
  }
}

export abstract class BaseSkoolScrapper {
  /** Every public, paid, English community matching the search, over all result pages */
  public abstract discover(query: { search: string }): Promise<Community[]>;
  public abstract about(input: {
    communityURL: string;
  }): Promise<FullCommunity | null>;
  public abstract lead(input: { leadURL: string }): Promise<FullLead | null>;
}
