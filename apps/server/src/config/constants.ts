import { skoolPriceFilters, skoolVisibilities } from "@repo/constants/campaign";
import { buildSearches } from "@server/lib/skool-discovery";

export type Role = "admin" | "user";
export const roles: [Role, ...Role[]] = ["admin", "user"];

export const logLevels = ["debug", "info", "warn", "error", "silent"] as const;
export type LogLevel = (typeof logLevels)[number];

// FullEnrich takes 100 contacts per batch and works on 100 at a time, so more batches at once would only wait in its queue and add polling calls to its 60 per minute limit
export const EMAIL_FINDER_BATCH_SIZE = 100;
export const EMAIL_FINDER_BATCHES_AT_ONCE = 2;
// Leads sharing one lookup are paid for once; custom values stay small if a lookup never fans out to more than this
export const EMAIL_FINDER_MAX_LEADS_PER_LOOKUP = 10;
// Answers are fetched by the sweep, which asks about a batch once it has waited this long and then at every run; FullEnrich takes 30-90 seconds per contact and allows 60 calls a minute
export const EMAIL_FINDER_STALE_MS = 2 * 60_000;
export const EMAIL_FINDER_SWEEP_LIMIT = 20;
export const EMAIL_FINDER_UNSTARTED_MS = 15 * 60_000;
export const EMAIL_FINDER_GIVE_UP_MS = 24 * 60 * 60_000;
export const EMAIL_FINDER_SWEEP_CRON = "*/2 * * * *";

export const SETUP_KEY = "setup";

export const DEFAULT_RECORD_LIMIT = 12;
export const EXPORT_RECORD_LIMIT = 50_000;

export const SKOOL_LOOKUP_CACHE_TTL_SECONDS = 3_600;
export const SKOOL_LOOKUP_MAX_RESULTS = 30;

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
