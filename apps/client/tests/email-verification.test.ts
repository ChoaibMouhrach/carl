import { describe, expect, test } from "bun:test";
import en from "../../../packages/i18n/messages/app/en.json";
import es from "../../../packages/i18n/messages/app/es.json";
import fr from "../../../packages/i18n/messages/app/fr.json";
import { getEmailVerificationState } from "../src/lib/email-verification";

describe("email verification callbacks", () => {
  test("maps callback errors to a safe display state", () => {
    expect(getEmailVerificationState()).toBe("verified");
    expect(getEmailVerificationState("TOKEN_EXPIRED")).toBe("expired");
    expect(getEmailVerificationState("INVALID_TOKEN")).toBe("invalid");
    expect(getEmailVerificationState("USER_NOT_FOUND")).toBe("invalid");
  });

  test("provides callback states in each supported language", () => {
    const translations = [en, es, fr];

    for (const translation of translations) {
      expect(translation.auth.emailVerified.resend).toBeString();
      expect(translation.auth.emailVerified.resendToast).toBeString();
      expect(translation.auth.emailVerified.expired.title).toBeString();
      expect(translation.auth.emailVerified.expired.description).toBeString();
      expect(translation.auth.emailVerified.invalid.title).toBeString();
      expect(translation.auth.emailVerified.invalid.description).toBeString();
    }
  });
});
