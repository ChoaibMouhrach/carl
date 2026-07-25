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
  "subscriptionExists",
  "checkoutActive",
  "noBillingCustomer",
  "noActiveSubscription",
  "subscriptionNotResumable",
  "planAlreadyActive",
  "currentPlanInvalid",
  "planInvalid",
  "stripeCustomerMismatch",
  "userNotFound",
] as const;

export type ServerErrorCode = (typeof serverErrorCodes)[number];
