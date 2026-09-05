import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export class FileApi extends BaseApi {
  public list(
    where: { clientId: number; folderId: number | null },
    query?: { page?: number },
  ) {
    return this.call(() =>
      http.api.clients[":clientId"].files.$get({
        param: { clientId: where.clientId.toString() },
        query: {
          folderId: where.folderId?.toString(),
          page: query?.page?.toString(),
        },
      }),
    );
  }

  public createMultipartUpload(
    where: { clientId: number; folderId: number | null },
    input: { name: string; sizeBytes: number; mimeType: string },
  ) {
    return this.call(() =>
      http.api.clients[":clientId"].files.multipart.$post({
        param: { clientId: where.clientId.toString() },
        json: { ...input, folderId: where.folderId },
      }),
    );
  }

  public completeMultipartUpload(
    where: { clientId: number; folderId: number | null },
    input: {
      uploadId: string;
      key: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      parts: { partNumber: number; eTag: string }[];
    },
  ) {
    return this.call(() =>
      http.api.clients[":clientId"].files.multipart.complete.$post({
        param: { clientId: where.clientId.toString() },
        json: { ...input, folderId: where.folderId },
      }),
    );
  }

  public abortMultipartUpload(
    where: { clientId: number },
    input: { uploadId: string; key: string },
  ) {
    return this.call(() =>
      http.api.clients[":clientId"].files.multipart.$delete({
        param: { clientId: where.clientId.toString() },
        json: input,
      }),
    );
  }

  public update(
    where: { clientId: number; fileId: number },
    input: { name: string },
  ) {
    return this.call(() =>
      http.api.clients[":clientId"].files[":fileId"].$patch({
        param: {
          clientId: where.clientId.toString(),
          fileId: where.fileId.toString(),
        },
        json: { name: input.name },
      }),
    );
  }

  public getDownloadUrl(where: { clientId: number; fileId: number }) {
    return this.call(() =>
      http.api.clients[":clientId"].files[":fileId"].download.$get({
        param: {
          clientId: where.clientId.toString(),
          fileId: where.fileId.toString(),
        },
      }),
    );
  }

  public remove(where: { clientId: number; fileId: number }) {
    return this.call(() =>
      http.api.clients[":clientId"].files[":fileId"].$delete({
        param: {
          clientId: where.clientId.toString(),
          fileId: where.fileId.toString(),
        },
      }),
    );
  }
}
