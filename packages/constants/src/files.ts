export const ALLOWED_DOCUMENT_EXTENSIONS = [
  "txt",
  "docx",
  "pdf",
  "csv",
  "xlsx",
] as const;

export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;
export const MULTIPART_THRESHOLD_BYTES = 25 * 1024 * 1024;
export const MULTIPART_PART_SIZE_BYTES = 25 * 1024 * 1024;
