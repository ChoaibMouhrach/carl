export const serverErrorCodes = [
  "permissionDenied",
  "setupAlreadyCompleted",
  "invalidCredentials",
  "emailNotVerified",
  "passwordResetInvalid",
  "passwordResetExpired",
  "sessionInvalid",
  "sessionExpired",
  "emailAlreadyTaken",
  "invalidPassword",
] as const;

export type ServerErrorCode = (typeof serverErrorCodes)[number];
