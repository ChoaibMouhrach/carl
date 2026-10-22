import { skoolPriceFilters, skoolVisibilities } from "@repo/constants/campaign";
import { buildSearches } from "@server/lib/skool-discovery";

export type Role = "admin" | "user";
export const roles: [Role, ...Role[]] = ["admin", "user"];

export const logLevels = ["debug", "info", "warn", "error", "silent"] as const;
export type LogLevel = (typeof logLevels)[number];

// FullEnrich takes 100 contacts per batch and works on 100 at a time, so more batches at once would only wait in its queue and add polling calls to its 60 per minute limit
export const EMAIL_FINDER_BATCH_SIZE = 100;
export const EMAIL_FINDER_BATCHES_AT_ONCE = 2;
// Leads sharing one lookup are paid for once; custom values and webhook payloads stay small if a lookup never fans out to more than this
export const EMAIL_FINDER_MAX_LEADS_PER_LOOKUP = 10;
// The webhook is the way answers arrive; the sweep only asks about batches that have waited this long, as FullEnrich asks not to be polled often
export const EMAIL_FINDER_STALE_MS = 5 * 60_000;
export const EMAIL_FINDER_SWEEP_LIMIT = 20;
export const EMAIL_FINDER_UNSTARTED_MS = 15 * 60_000;
export const EMAIL_FINDER_GIVE_UP_MS = 24 * 60 * 60_000;
export const EMAIL_FINDER_SWEEP_CRON = "*/5 * * * *";

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
