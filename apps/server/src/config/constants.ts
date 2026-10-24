export type Role = "admin" | "user";
export const roles: [Role, ...Role[]] = ["admin", "user"];

export const logLevels = ["debug", "info", "warn", "error", "silent"] as const;
export type LogLevel = (typeof logLevels)[number];

export const SETUP_KEY = "setup";

export const HTTP_IDLE_TIMEOUT_SECONDS = 60;
