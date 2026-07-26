import { describe, expect, test } from "bun:test";
import en from "../../../packages/i18n/messages/app/en.json";
import es from "../../../packages/i18n/messages/app/es.json";
import fr from "../../../packages/i18n/messages/app/fr.json";
import {
  authErrorTranslationCodes,
  getAuthErrorTranslationCode,
} from "../src/lib/auth-errors";

describe("auth error translations", () => {
  test("maps Better Auth errors to the matching server error", () => {
    expect(getAuthErrorTranslationCode("INVALID_EMAIL_OR_PASSWORD")).toBe(
      "invalidCredentials",
    );
    expect(getAuthErrorTranslationCode("EMAIL_NOT_VERIFIED")).toBe(
      "emailNotVerified",
    );
    expect(
      getAuthErrorTranslationCode("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"),
    ).toBe("emailAlreadyTaken");
    expect(getAuthErrorTranslationCode("INVALID_TOKEN")).toBe(
      "passwordResetInvalid",
    );
    expect(getAuthErrorTranslationCode("PASSWORD_TOO_SHORT")).toBe(
      "invalidPassword",
    );
    expect(getAuthErrorTranslationCode("UNKNOWN_ERROR")).toBeUndefined();
  });

  test("provides every mapped error in each supported language", () => {
    const translations = [en, es, fr];

    for (const translation of translations) {
      for (const errorCode of Object.values(authErrorTranslationCodes)) {
        expect(translation.serverErrors[errorCode]).toBeString();
        expect(translation.serverErrors[errorCode].length).toBeGreaterThan(0);
      }
    }
  });
});
