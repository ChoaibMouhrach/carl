import type { DiscoveryCriteria } from "@server/lib/skool-discovery";

export type Role = "admin" | "user";
export const roles: [Role, ...Role[]] = ["admin", "user"];

export const SETUP_KEY = "setup";

export const DEFAULT_RECORD_LIMIT = 12;

export const SKOOL_DISCOVERY_PAGE_SIZE = 30;
// Skool stops serving discovery pages after this many results per search
export const SKOOL_DISCOVERY_MAX_RESULTS = 1000;
export const SKOOL_DISCOVERY_CONCURRENCY = 8;
export const SKOOL_COMMUNITY_CONCURRENCY = 12;

export const DEFAULT_SKOOL_SEARCHES: DiscoveryCriteria[] = [
  { visibility: "private", price: "free" },
  { visibility: "public", price: "paid" },
  { visibility: "public", price: "free-trial" },
];
