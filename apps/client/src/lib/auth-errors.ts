import type { ServerErrorCode } from "@repo/constants/errors";

export const authErrorTranslationCodes: Record<string, ServerErrorCode> = {
  EMAIL_NOT_VERIFIED: "emailNotVerified",
  INVALID_EMAIL: "invalidCredentials",
  INVALID_EMAIL_OR_PASSWORD: "invalidCredentials",
  INVALID_PASSWORD: "invalidPassword",
  INVALID_PASSWORD_RESET_TOKEN: "passwordResetInvalid",
  INVALID_TOKEN: "passwordResetInvalid",
  INVALID_TOKEN_EXPIRED: "passwordResetExpired",
  PASSWORD_TOO_LONG: "invalidPassword",
  PASSWORD_TOO_SHORT: "invalidPassword",
  PASSWORD_TOO_WEAK: "invalidPassword",
  RESET_PASSWORD_TOKEN_EXPIRED: "passwordResetExpired",
  SESSION_EXPIRED: "sessionExpired",
  SESSION_NOT_FOUND: "sessionInvalid",
  USER_ALREADY_EXISTS: "emailAlreadyTaken",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "emailAlreadyTaken",
};

export const getAuthErrorTranslationCode = (code?: string) =>
  code ? authErrorTranslationCodes[code] : undefined;
