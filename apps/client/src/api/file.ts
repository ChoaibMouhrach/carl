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
