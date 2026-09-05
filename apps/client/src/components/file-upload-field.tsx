import * as React from "react";
import {
  FileArchiveIcon,
  FileAudioIcon,
  FileCodeIcon,
  FileIcon,
  FileTextIcon,
  FileVideoIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";

import { formatBytes } from "@/lib/format-bytes";
import { cn } from "@repo/ui/utils";
import { Button } from "@repo/ui/components/ui/button";
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadList,
  FileUploadItem,
  FileUploadItemPreview,
  FileUploadItemMetadata,
  FileUploadItemDelete,
  type FileUploadProps,
} from "@/components/file-upload";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Represents a file that already exists on the server.
 * Used to display previously uploaded files alongside new ones.
 */
export type ExistingFile = {
  id: string;
  url: string;
  name: string;
  size: number;
  type: string;
};

export type FileUploadFieldProps = {
  /** Accepted file types (e.g. "image/*", "video/*,.pdf") */
  accept?: string;
  /**
   * Maximum number of files allowed.
   * When set to 1, enables single-file mode with large image/video previews.
   */
  maxFiles?: number;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Disable the entire upload field */
  disabled?: boolean;
  /** Controlled array of new File objects */
  value?: File[];
  /** Called when new files are added or removed */
  onValueChange?: (files: File[]) => void;
  /** Files that already exist on the server */
  existingFiles?: ExistingFile[];
  /** Called when the user removes an existing file */
  onExistingFileRemove?: (file: ExistingFile) => void;
  /** Upload handler with progress/success/error callbacks */
  onUpload?: FileUploadProps["onUpload"];
  /** Per-file validation. Return an error message string to reject. */
  onFileValidate?: (file: File) => string | null | undefined;
  className?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isImageType(type: string): boolean {
  return type.startsWith("image/");
}

function isVideoType(type: string): boolean {
  return type.startsWith("video/");
}

function getFileIconForType(type: string, name: string): React.ReactNode {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  if (type.startsWith("video/")) return <FileVideoIcon />;
  if (type.startsWith("audio/")) return <FileAudioIcon />;
  if (type.startsWith("text/") || ["txt", "md", "rtf", "pdf"].includes(ext))
    return <FileTextIcon />;
  if (
    ["html", "css", "js", "jsx", "ts", "tsx", "json", "xml", "py"].includes(ext)
  )
    return <FileCodeIcon />;
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext))
    return <FileArchiveIcon />;

  return <FileIcon />;
}

// ─── useObjectUrl ──────────────────────────────────────────────────────────────

/**
 * Creates a stable object URL for a File and automatically revokes it on
 * cleanup or when the File reference changes. Prevents memory leaks from
 * orphaned blob URLs.
 */
function useObjectUrl(file: File | null): string | undefined {
  const [url, setUrl] = React.useState<string>();

  React.useEffect(() => {
    if (!file) {
      setUrl(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return url;
}

// ─── Thumbnail ────────────────────────────────────────────────────────────────

/**
 * Renders the correct thumbnail for a given file type and URL.
 * Used by both ExistingFileListItem and the new-file list to ensure
 * identical preview behaviour regardless of file origin.
 *
 * - Images  → `<img>` scaled to cover the thumbnail area
 * - Videos  → `<video>` with `preload="metadata"` to show the first frame
 * - Other   → a matching file-type icon
 */
function Thumbnail({
  src,
  type,
  name,
}: {
  src: string;
  type: string;
  name: string;
}) {
  if (isImageType(type)) {
    return (
      // biome-ignore lint/performance/noImgElement: blob/server URLs
      <img src={src} alt={name} className="size-full object-cover" />
    );
  }

  if (isVideoType(type)) {
    return (
      <video
        src={src}
        muted
        preload="metadata"
        className="size-full object-cover"
      >
        <track kind="captions" />
      </video>
    );
  }

  return <>{getFileIconForType(type, name)}</>;
}

/**
 * Wraps a new `File` in a `Thumbnail`, managing the object URL lifecycle.
 * The URL is created on mount and revoked on unmount or file change.
 */
function NewFileThumbnail({ file }: { file: File }) {
  const url = useObjectUrl(file);

  if (!url) return <>{getFileIconForType(file.type, file.name)}</>;

  return <Thumbnail src={url} type={file.type} name={file.name} />;
}

// ─── FileUploadField ──────────────────────────────────────────────────────────

/**
 * A high-level file upload component built on diceui primitives.
 *
 * **Single-file mode** (`maxFiles={1}`):
 * - Shows a large preview for images and videos, with a "Replace" button below.
 * - Non-media files display a compact card with an icon and metadata.
 * - Clicking "Replace" clears the file and reveals the dropzone.
 *
 * **Multi-file mode** (`maxFiles > 1` or unset):
 * - Shows the dropzone at the top and a scrollable list below.
 * - Existing server files and new files appear in one unified list.
 * - The `maxFiles` limit accounts for existing files automatically.
 *
 * Both modes support **existing files** — files already persisted on the server
 * that should be displayed alongside freshly selected ones.
 */
function FileUploadField({
  accept,
  maxFiles,
  maxSize,
  disabled = false,
  value = [],
  onValueChange,
  existingFiles = [],
  onExistingFileRemove,
  onUpload,
  onFileValidate,
  className,
}: FileUploadFieldProps) {
  const isSingleMode = maxFiles === 1;

  // ── Single-file mode resolution ──
  // A new file always takes precedence over an existing one.
  const activeNewFile = isSingleMode ? (value[0] ?? null) : null;
  const activeExistingFile =
    isSingleMode && value.length === 0 ? (existingFiles[0] ?? null) : null;
  const hasActiveFile =
    isSingleMode && (activeNewFile !== null || activeExistingFile !== null);

  // ── Multi-file mode: reduce maxFiles by existing file count ──
  const effectiveMaxFiles =
    maxFiles !== undefined
      ? Math.max(0, maxFiles - existingFiles.length)
      : undefined;

  const handleReplace = React.useCallback(() => {
    onValueChange?.([]);
    if (activeExistingFile) {
      onExistingFileRemove?.(activeExistingFile);
    }
  }, [onValueChange, activeExistingFile, onExistingFileRemove]);

  // ── Single-file mode ──
  if (isSingleMode) {
    return (
      <FileUpload
        maxFiles={1}
        maxSize={maxSize}
        accept={accept}
        disabled={disabled}
        value={value}
        onValueChange={onValueChange}
        onUpload={onUpload}
        onFileValidate={onFileValidate}
        className={cn("w-full bg-background", className)}
      >
        {hasActiveFile ? (
          <SingleFilePreview
            newFile={activeNewFile}
            existingFile={activeExistingFile}
            onReplace={handleReplace}
            disabled={disabled}
          />
        ) : (
          <DropzoneContent accept={accept} maxSize={maxSize} />
        )}
      </FileUpload>
    );
  }

  // ── Multi-file mode ──
  return (
    <FileUpload
      maxFiles={effectiveMaxFiles}
      maxSize={maxSize}
      accept={accept}
      disabled={disabled}
      multiple
      value={value}
      onValueChange={onValueChange}
      onUpload={onUpload}
      onFileValidate={onFileValidate}
      className={cn("w-full", className)}
    >
      <DropzoneContent accept={accept} maxSize={maxSize} />

      {/* Unified file list: existing files first, then new files */}
      {(existingFiles.length > 0 || value.length > 0) && (
        <div
          role="list"
          aria-label="Uploaded files"
          className="flex flex-col gap-2"
        >
          {existingFiles.map((file) => (
            <ExistingFileListItem
              key={file.id}
              file={file}
              onRemove={onExistingFileRemove}
              disabled={disabled}
            />
          ))}
        </div>
      )}

      <FileUploadList>
        {value.map((file) => (
          <FileUploadItem
            key={`${file.name}-${file.lastModified}`}
            value={file}
          >
            <FileUploadItemPreview
              render={(f, fallback) => {
                if (isVideoType(f.type)) return <NewFileThumbnail file={f} />;
                return fallback();
              }}
            />
            <FileUploadItemMetadata />
            <FileUploadItemDelete asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground"
              >
                <XIcon />
                <span className="sr-only">Remove {file.name}</span>
              </Button>
            </FileUploadItemDelete>
          </FileUploadItem>
        ))}
      </FileUploadList>
    </FileUpload>
  );
}

// ─── DropzoneContent ──────────────────────────────────────────────────────────

function DropzoneContent({
  accept,
  maxSize,
}: {
  accept?: string;
  maxSize?: number;
}) {
  const hint = [
    accept && `Accepted: ${accept}`,
    maxSize && `Max size: ${formatBytes(maxSize)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <FileUploadDropzone className="flex flex-col items-center justify-center gap-2 p-8">
      <div className="flex items-center justify-center rounded-full border bg-background p-2.5 shadow-xs">
        <UploadIcon className="size-5 text-muted-foreground" />
      </div>
      <div className="flex flex-col items-center gap-0.5 text-center">
        <p className="text-sm font-medium">
          Drop files here or click to browse
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </FileUploadDropzone>
  );
}

// ─── SingleFilePreview ────────────────────────────────────────────────────────

/**
 * Large preview for single-file mode. Shows an inline image or video player
 * for media files, and a compact icon + metadata card for everything else.
 */
function SingleFilePreview({
  newFile,
  existingFile,
  onReplace,
  disabled,
}: {
  newFile: File | null;
  existingFile: ExistingFile | null;
  onReplace: () => void;
  disabled: boolean;
}) {
  const objectUrl = useObjectUrl(newFile);

  const fileType = newFile?.type ?? existingFile?.type ?? "";
  const fileName = newFile?.name ?? existingFile?.name ?? "";
  const fileSize = newFile?.size ?? existingFile?.size ?? 0;
  const previewUrl = objectUrl ?? existingFile?.url;

  const isImage = isImageType(fileType);
  const isVideo = isVideoType(fileType);

  // ── Media preview (image or video) ──
  if ((isImage || isVideo) && previewUrl) {
    return (
      <div className="flex flex-col gap-3">
        <div className="overflow-hidden rounded-lg border bg-muted/30">
          {isImage && (
            // biome-ignore lint/performance/noImgElement: blob/server URLs aren't compatible with Next.js Image
            <img
              src={previewUrl}
              alt={fileName}
              className="max-h-72 w-full object-contain"
            />
          )}
          {isVideo && (
            <video
              src={previewUrl}
              controls
              muted
              playsInline
              className="max-h-72 w-full"
            >
              <track kind="captions" />
            </video>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{fileName}</span>
            <span className="text-xs text-muted-foreground">
              {formatBytes(fileSize)}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={onReplace}
          >
            Replace
          </Button>
        </div>
      </div>
    );
  }

  // ── Generic file (non-media) ──
  return (
    <div className="flex items-center gap-2.5 rounded-md border p-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded border bg-accent/50 text-muted-foreground [&>svg]:size-5">
        {getFileIconForType(fileType, fileName)}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{fileName}</span>
        <span className="text-xs text-muted-foreground">
          {formatBytes(fileSize)}
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={onReplace}
      >
        Replace
      </Button>
    </div>
  );
}

// ─── ExistingFileListItem ─────────────────────────────────────────────────────

/**
 * Renders a server-side file in the multi-file list.
 * Visually matches the diceui FileUploadItem styling so existing and new
 * files form one cohesive list.
 */
function ExistingFileListItem({
  file,
  onRemove,
  disabled,
}: {
  file: ExistingFile;
  onRemove?: (file: ExistingFile) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="listitem"
      className="relative flex items-center gap-2.5 rounded-md border p-3"
    >
      {/* Thumbnail — uses the same Thumbnail component as new files */}
      <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border bg-accent/50 text-muted-foreground [&>svg]:size-5">
        <Thumbnail src={file.url} type={file.type} name={file.name} />
      </div>

      {/* Metadata */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{file.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {formatBytes(file.size)}
        </span>
      </div>

      {/* Remove */}
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={disabled}
          onClick={() => onRemove(file)}
          className="text-muted-foreground hover:text-foreground"
        >
          <XIcon />
          <span className="sr-only">Remove {file.name}</span>
        </Button>
      )}
    </div>
  );
}

export { FileUploadField };
