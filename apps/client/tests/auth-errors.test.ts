import { describe, expect, test } from "bun:test";
import { authErrorCodes, getAuthErrorCode } from "../src/lib/auth-errors";
import { serverErrorMessages } from "../src/lib/server-errors";

describe("auth errors", () => {
  test("maps Better Auth errors to the matching server error", () => {
    expect(getAuthErrorCode("INVALID_EMAIL_OR_PASSWORD")).toBe(
      "invalidCredentials",
    );
    expect(getAuthErrorCode("EMAIL_NOT_VERIFIED")).toBe("emailNotVerified");
    expect(getAuthErrorCode("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")).toBe(
      "emailAlreadyTaken",
    );
    expect(getAuthErrorCode("INVALID_TOKEN")).toBe("passwordResetInvalid");
    expect(getAuthErrorCode("PASSWORD_TOO_SHORT")).toBe("invalidPassword");
    expect(getAuthErrorCode("UNKNOWN_ERROR")).toBeUndefined();
  });

  test("has a message for every mapped error", () => {
    for (const errorCode of Object.values(authErrorCodes)) {
      expect(serverErrorMessages[errorCode]).toBeString();
      expect(serverErrorMessages[errorCode].length).toBeGreaterThan(0);
    }
  });
});
