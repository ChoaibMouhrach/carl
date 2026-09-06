export type Role = "admin" | "user";
export const roles: [Role, ...Role[]] = ["admin", "user"];

export const SETUP_KEY = "setup";

export const DEFAULT_RECORD_LIMIT = 12;

export const BILLING_PAST_DUE_GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1_000;

export const CHUNKABLE_MIME_TYPES: readonly string[] = [
  "text/plain",
  "text/csv",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

// Above this, a file is skipped for chunking rather than extracted and
// embedded — an upload this large would produce tens of thousands of chunk
// rows and embedding calls in one job, overwhelming the queue worker and DB.
export const CHUNKING_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
