export type Role = "admin" | "user";
export const roles: [Role, ...Role[]] = ["admin", "user"];

export const SETUP_KEY = "setup";

export const DEFAULT_RECORD_LIMIT = 9;

export const BILLING_PAST_DUE_GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1_000;
