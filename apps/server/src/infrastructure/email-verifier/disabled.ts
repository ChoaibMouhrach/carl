import {
  BaseEmailVerifier,
  EmailVerifierError,
  type VerifiedEmail,
} from "@server/lib/base-email-verifier";

export class DisabledEmailVerifier extends BaseEmailVerifier {
  public override readonly isAvailable = false;

  public override async verify(): Promise<VerifiedEmail[]> {
    throw new EmailVerifierError({
      message: "Email verification is not configured.",
      retryable: false,
    });
  }
}
