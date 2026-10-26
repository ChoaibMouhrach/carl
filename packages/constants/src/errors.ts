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
  "leadNotFound",
  "leadUsernameTaken",
  "leadSkoolUrlTaken",
  "communityNotFound",
  "communitySkoolUrlTaken",
  "invalidCommunityPricing",
  "campaignNotFound",
] as const;

export type ServerErrorCode = (typeof serverErrorCodes)[number];
