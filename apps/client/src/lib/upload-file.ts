import { api } from "@/api";
import { ApiError } from "@/lib/base-api";
import { env } from "@/config/env";
import {
  MULTIPART_PART_SIZE_BYTES,
  MULTIPART_THRESHOLD_BYTES,
} from "@repo/constants/files";

export interface UploadedFile {
  fileId: number;
  name: string;
  sizeBytes: number;
  mimeType: string;
  url: string;
}

export interface UploadFileHandle {
  promise: Promise<UploadedFile>;
  abort: () => void;
}

export const uploadFileToFolder = (input: {
  clientId: number;
  folderId: number | null;
  file: File;
  onProgress?: (percent: number) => void;
}): UploadFileHandle =>
  input.file.size > MULTIPART_THRESHOLD_BYTES
    ? uploadMultipartFileToFolder(input)
    : uploadSingleFileToFolder(input);

const uploadSingleFileToFolder = (input: {
  clientId: number;
  folderId: number | null;
  file: File;
  onProgress?: (percent: number) => void;
}): UploadFileHandle => {
  const xhr = new XMLHttpRequest();

  const promise = new Promise<UploadedFile>((resolve, reject) => {
    const formData = new FormData();
    if (input.folderId !== null) {
      formData.append("folderId", input.folderId.toString());
    }
    formData.append("file", input.file);

    xhr.open("POST", `${env.VITE_API_URL}/api/clients/${input.clientId}/files`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        input.onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as UploadedFile);
        return;
      }

      let message = "Something went wrong";
      let code: string | undefined;
      try {
        const data = JSON.parse(xhr.responseText) as {
          message?: string;
          code?: string;
        };
        message = data.message ?? message;
        code = data.code;
      } catch {
        // response body wasn't JSON, fall back to the generic message
      }

      reject(new ApiError({ statusCode: xhr.status, message, code }));
    };

    xhr.onerror = () => {
      reject(
        new ApiError({
          statusCode: 599,
          message:
            "A network error occurred. Please check your internet connection",
        }),
      );
    };

    xhr.onabort = () => {
      reject(new DOMException("Upload aborted", "AbortError"));
    };

    xhr.send(formData);
  });

  return { promise, abort: () => xhr.abort() };
};

const MAX_CONCURRENT_PART_UPLOADS = 3;

const uploadPart = (input: {
  url: string;
  body: Blob;
  onProgress: (loaded: number) => void;
}): { promise: Promise<string>; abort: () => void } => {
  const xhr = new XMLHttpRequest();

  const promise = new Promise<string>((resolve, reject) => {
    xhr.open("PUT", input.url);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        input.onProgress(event.loaded);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const eTag = xhr.getResponseHeader("ETag");

        if (!eTag) {
          reject(
            new ApiError({ statusCode: 500, message: "Something went wrong" }),
          );
          return;
        }

        resolve(eTag);
        return;
      }

      reject(
        new ApiError({
          statusCode: xhr.status,
          message: "Something went wrong",
        }),
      );
    };

    xhr.onerror = () => {
      reject(
        new ApiError({
          statusCode: 599,
          message:
            "A network error occurred. Please check your internet connection",
        }),
      );
    };

    xhr.onabort = () => {
      reject(new DOMException("Upload aborted", "AbortError"));
    };

    xhr.send(input.body);
  });

  return { promise, abort: () => xhr.abort() };
};

const uploadMultipartFileToFolder = (input: {
  clientId: number;
  folderId: number | null;
  file: File;
  onProgress?: (percent: number) => void;
}): UploadFileHandle => {
  let aborted = false;
  let pendingUpload: { uploadId: string; key: string } | null = null;
  const partHandles: { abort: () => void }[] = [];

  const run = async (): Promise<UploadedFile> => {
    if (aborted) throw new DOMException("Upload aborted", "AbortError");

    const mimeType = input.file.type || "application/octet-stream";

    const { uploadId, key, name, parts } = await api.file.createMultipartUpload(
      { clientId: input.clientId, folderId: input.folderId },
      { name: input.file.name, sizeBytes: input.file.size, mimeType },
    );
    pendingUpload = { uploadId, key };

    if (aborted) throw new DOMException("Upload aborted", "AbortError");

    const loadedByPart = new Array<number>(parts.length).fill(0);
    const reportProgress = () => {
      const loaded = loadedByPart.reduce((sum, value) => sum + value, 0);
      input.onProgress?.(Math.round((loaded / input.file.size) * 100));
    };

    const results = new Array<{ partNumber: number; eTag: string }>(
      parts.length,
    );
    let nextIndex = 0;

    const runNext = async (): Promise<void> => {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= parts.length) return;

      const part = parts[index]!;
      const start = (part.partNumber - 1) * MULTIPART_PART_SIZE_BYTES;
      const end = Math.min(start + MULTIPART_PART_SIZE_BYTES, input.file.size);

      const handle = uploadPart({
        url: part.signedUrl,
        body: input.file.slice(start, end),
        onProgress: (loaded) => {
          loadedByPart[index] = loaded;
          reportProgress();
        },
      });
      partHandles.push(handle);

      const eTag = await handle.promise;
      loadedByPart[index] = end - start;
      reportProgress();
      results[index] = { partNumber: part.partNumber, eTag };

      await runNext();
    };

    await Promise.all(
      Array.from(
        { length: Math.min(MAX_CONCURRENT_PART_UPLOADS, parts.length) },
        () => runNext(),
      ),
    );

    return await api.file.completeMultipartUpload(
      { clientId: input.clientId, folderId: input.folderId },
      {
        uploadId,
        key,
        name,
        mimeType,
        sizeBytes: input.file.size,
        parts: results,
      },
    );
  };

  const promise = run().catch((error: unknown) => {
    if (
      error instanceof DOMException &&
      error.name === "AbortError" &&
      pendingUpload
    ) {
      void api.file.abortMultipartUpload(
        { clientId: input.clientId },
        pendingUpload,
      );
    }

    throw error;
  });

  return {
    promise,
    abort: () => {
      aborted = true;
      for (const handle of partHandles) handle.abort();
    },
  };
};
