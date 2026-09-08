import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export class FileApi extends BaseApi {
  public list(query?: { page?: number; search?: string }) {
    return this.call(() =>
      http.api.files.$get({
        query: {
          page: query?.page?.toString(),
          search: query?.search,
        },
      }),
    );
  }

  public createMultipartUpload(input: {
    name: string;
    sizeBytes: number;
    mimeType: string;
  }) {
    return this.call(() =>
      http.api.files.multipart.$post({
        json: input,
      }),
    );
  }

  public completeMultipartUpload(input: {
    uploadId: string;
    key: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    parts: { partNumber: number; eTag: string }[];
  }) {
    return this.call(() =>
      http.api.files.multipart.complete.$post({
        json: input,
      }),
    );
  }

  public abortMultipartUpload(input: { uploadId: string; key: string }) {
    return this.call(() =>
      http.api.files.multipart.$delete({
        json: input,
      }),
    );
  }

  public update(where: { fileId: number }, input: { name: string }) {
    return this.call(() =>
      http.api.files[":fileId"].$patch({
        param: { fileId: where.fileId.toString() },
        json: { name: input.name },
      }),
    );
  }

  public getDownloadUrl(where: { fileId: number }) {
    return this.call(() =>
      http.api.files[":fileId"].download.$get({
        param: { fileId: where.fileId.toString() },
      }),
    );
  }

  public remove(where: { fileId: number }) {
    return this.call(() =>
      http.api.files[":fileId"].$delete({
        param: { fileId: where.fileId.toString() },
      }),
    );
  }
}
