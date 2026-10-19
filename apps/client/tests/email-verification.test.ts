import { describe, expect, test } from "bun:test";
import { getEmailVerificationState } from "../src/lib/email-verification";

describe("email verification callbacks", () => {
  test("maps callback errors to a safe display state", () => {
    expect(getEmailVerificationState()).toBe("verified");
    expect(getEmailVerificationState("TOKEN_EXPIRED")).toBe("expired");
    expect(getEmailVerificationState("INVALID_TOKEN")).toBe("invalid");
    expect(getEmailVerificationState("USER_NOT_FOUND")).toBe("invalid");
  });
});
