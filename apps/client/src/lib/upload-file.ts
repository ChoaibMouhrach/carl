import { ApiError } from "@/lib/base-api";
import { env } from "@/config/env";

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
