export type EmailVerificationState = "expired" | "invalid" | "verified";

export const getEmailVerificationState = (
  error?: string,
): EmailVerificationState => {
  if (!error) {
    return "verified";
  }

  return error === "TOKEN_EXPIRED" ? "expired" : "invalid";
};
