import {
  BaseContactEnrichment,
  ContactEnrichmentError,
  type ContactEnrichmentResult,
} from "@server/lib/base-contact-enrichment";

export class DisabledContactEnrichment extends BaseContactEnrichment {
  public override readonly isAvailable = false;

  public override async enrich(): Promise<ContactEnrichmentResult> {
    throw new ContactEnrichmentError({
      message: "Contact enrichment is not configured.",
      retryable: false,
    });
  }
}
