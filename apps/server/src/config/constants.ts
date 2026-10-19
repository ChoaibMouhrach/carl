import { skoolPriceFilters, skoolVisibilities } from "@repo/constants/campaign";
import { buildSearches } from "@server/lib/skool-discovery";

export type Role = "admin" | "user";
export const roles: [Role, ...Role[]] = ["admin", "user"];

export const SETUP_KEY = "setup";

export const DEFAULT_RECORD_LIMIT = 12;
export const EXPORT_RECORD_LIMIT = 50_000;

export const EVENT_STREAM_HEARTBEAT_MS = 15_000;
export const HTTP_IDLE_TIMEOUT_SECONDS = 60;

export const SKOOL_DISCOVERY_PAGE_SIZE = 30;
// Skool stops serving discovery pages after this many results per search
export const SKOOL_DISCOVERY_MAX_RESULTS = 1000;
export const SKOOL_DISCOVERY_CONCURRENCY = 8;
export const SKOOL_COMMUNITY_CONCURRENCY = 12;

export const DEFAULT_SKOOL_SEARCHES = buildSearches(
  skoolVisibilities,
  skoolPriceFilters,
);
