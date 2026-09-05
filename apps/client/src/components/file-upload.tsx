import * as React from "react";
import { useDropzone } from "react-dropzone";
import { formatBytes } from "@/lib/format-bytes";
import { cn } from "@repo/ui/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FileUploadProps = {
  maxFiles?: number;
  maxSize?: number;
  accept?: string;
  disabled?: boolean;
  multiple?: boolean;
  value?: File[];
  onValueChange?: (files: File[]) => void;
  onUpload?: (files: File[]) => Promise<void>;
  onFileValidate?: (file: File) => string | null | undefined;
  className?: string;
  children?: React.ReactNode;
};

// ─── Context ──────────────────────────────────────────────────────────────────

type FileUploadCtxValue = {
  files: File[];
  removeFile: (file: File) => void;
  openFileDialog: () => void;
  isDragActive: boolean;
  getRootProps: () => React.HTMLAttributes<HTMLElement>;
  disabled: boolean;
};

const FileUploadCtx = React.createContext<FileUploadCtxValue | null>(null);

function useFileUploadCtx() {
  const ctx = React.useContext(FileUploadCtx);
  if (!ctx) throw new Error("Must be used within <FileUpload>");
  return ctx;
}

// ─── FileUpload ───────────────────────────────────────────────────────────────

function parseAccept(accept: string): Record<string, string[]> {
  return Object.fromEntries(
    accept
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => [t, []]),
  );
}

export function FileUpload({
  maxFiles,
  maxSize,
  accept,
  disabled = false,
  multiple = false,
  value = [],
  onValueChange,
  onUpload,
  onFileValidate,
  className,
  children,
}: FileUploadProps) {
  const onDrop = React.useCallback(
    (acceptedFiles: File[]) => {
      let filtered = acceptedFiles;
      if (onFileValidate) {
        filtered = acceptedFiles.filter((f) => !onFileValidate(f));
      }
      const limit = maxFiles ?? (multiple ? undefined : 1);
      const next = multiple
        ? [...value, ...filtered].slice(0, limit)
        : filtered.slice(0, 1);
      onValueChange?.(next);
      if (onUpload) onUpload(next);
    },
    [value, onValueChange, onUpload, onFileValidate, multiple, maxFiles],
  );

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    onDrop,
    accept: accept ? parseAccept(accept) : undefined,
    maxSize,
    maxFiles,
    multiple: multiple || (maxFiles ?? 1) > 1,
    disabled,
    noClick: true,
    noKeyboard: true,
  });

  const removeFile = React.useCallback(
    (file: File) => {
      onValueChange?.(value.filter((f) => f !== file));
    },
    [value, onValueChange],
  );

  return (
    <FileUploadCtx.Provider
      value={{
        files: value,
        removeFile,
        openFileDialog: open,
        isDragActive,
        getRootProps: getRootProps as () => React.HTMLAttributes<HTMLElement>,
        disabled,
      }}
    >
      <div className={cn("flex flex-col gap-2", className)}>
        {children}
        <input {...getInputProps()} className="sr-only" />
      </div>
    </FileUploadCtx.Provider>
  );
}

// ─── FileUploadDropzone ───────────────────────────────────────────────────────

export function FileUploadDropzone({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { openFileDialog, isDragActive, getRootProps, disabled } =
    useFileUploadCtx();
  const rootProps = getRootProps();

  return (
    <div
      {...rootProps}
      {...props}
      onClick={disabled ? undefined : openFileDialog}
      role="button"
      tabIndex={disabled ? undefined : 0}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) openFileDialog();
        props.onKeyDown?.(e);
      }}
      className={cn(
        "rounded-lg border border-dashed transition-colors",
        isDragActive && "border-primary bg-primary/5",
        disabled
          ? "pointer-events-none opacity-50"
          : "cursor-pointer hover:border-primary/50",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ─── FileUploadList ───────────────────────────────────────────────────────────

export function FileUploadList({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { files } = useFileUploadCtx();
  if (files.length === 0) return null;

  return (
    <div
      role="list"
      aria-label="Files to upload"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    >
      {children}
    </div>
  );
}

// ─── FileUploadItem ───────────────────────────────────────────────────────────

type FileUploadItemCtxValue = { file: File };
const FileUploadItemCtx = React.createContext<FileUploadItemCtxValue | null>(
  null,
);

function useFileUploadItemCtx() {
  const ctx = React.useContext(FileUploadItemCtx);
  if (!ctx) throw new Error("Must be used within <FileUploadItem>");
  return ctx;
}

export function FileUploadItem({
  value,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: File }) {
  return (
    <FileUploadItemCtx.Provider value={{ file: value }}>
      <div
        role="listitem"
        className={cn(
          "relative flex items-center gap-2.5 rounded-md border p-3",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </FileUploadItemCtx.Provider>
  );
}

// ─── FileUploadItemPreview ────────────────────────────────────────────────────

type FileUploadItemPreviewProps = {
  render?: (file: File, fallback: () => React.ReactNode) => React.ReactNode;
  className?: string;
};

export function FileUploadItemPreview({
  render,
  className,
}: FileUploadItemPreviewProps) {
  const { file } = useFileUploadItemCtx();
  const [previewUrl, setPreviewUrl] = React.useState<string>();

  React.useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const fallback = (): React.ReactNode => {
    if (previewUrl) {
      return (
        <img
          src={previewUrl}
          alt={file.name}
          className="size-full object-cover"
        />
      );
    }
    return null;
  };

  return (
    <div
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border bg-accent/50 text-muted-foreground [&>svg]:size-5",
        className,
      )}
    >
      {render ? render(file, fallback) : fallback()}
    </div>
  );
}

// ─── FileUploadItemMetadata ───────────────────────────────────────────────────

export function FileUploadItemMetadata({ className }: { className?: string }) {
  const { file } = useFileUploadItemCtx();

  return (
    <div className={cn("flex min-w-0 flex-1 flex-col", className)}>
      <span className="truncate text-sm font-medium">{file.name}</span>
      <span className="text-xs text-muted-foreground">
        {formatBytes(file.size)}
      </span>
    </div>
  );
}

// ─── FileUploadItemDelete ─────────────────────────────────────────────────────

type FileUploadItemDeleteProps =
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
  };

export function FileUploadItemDelete({
  asChild,
  children,
  className,
  onClick,
  ...props
}: FileUploadItemDeleteProps) {
  const { file } = useFileUploadItemCtx();
  const { removeFile, disabled } = useFileUploadCtx();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    removeFile(file);
    onClick?.(e);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(
      children as React.ReactElement<
        React.ButtonHTMLAttributes<HTMLButtonElement>
      >,
      {
        onClick: handleClick,
        disabled:
          disabled ||
          (children.props as React.ButtonHTMLAttributes<HTMLButtonElement>)
            .disabled,
        ...props,
      },
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
}
