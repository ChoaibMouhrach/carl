import type { ServerErrorCode } from "@repo/constants/errors";

export const serverErrorMessages: Record<ServerErrorCode, string> = {
  permissionDenied: "You don't have permission to do that.",
  setupAlreadyCompleted: "Setup has already been completed.",
  invalidCredentials: "Incorrect email or password.",
  emailNotVerified: "Your email address hasn't been verified yet.",
  passwordResetInvalid:
    "This password reset link is invalid or has already been used.",
  passwordResetExpired:
    "This password reset link has expired. Please request a new one.",
  sessionInvalid: "Your session is invalid. Please sign in again.",
  sessionExpired: "Your session has expired. Please sign in again.",
  emailAlreadyTaken: "That email address is already taken.",
  invalidPassword: "Incorrect password.",
  leadNotFound: "That lead doesn't exist.",
  leadUsernameTaken: "A lead with that username already exists.",
  leadSkoolUrlTaken: "A lead with that Skool URL already exists.",
  communityNotFound: "That community doesn't exist.",
  communitySkoolUrlTaken: "A community with that Skool URL already exists.",
  invalidCommunityPricing:
    "A free community has no price, and a paid one needs an amount, currency and interval.",
};
