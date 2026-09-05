import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export class FolderApi extends BaseApi {
  public list(
    where: { clientId: number },
    query?: { parentId?: number; page?: number; search?: string },
  ) {
    return this.call(() =>
      http.api.clients[":clientId"].folders.$get({
        param: { clientId: where.clientId.toString() },
        query: {
          parentId: query?.parentId?.toString(),
          page: query?.page?.toString(),
          search: query?.search,
        },
      }),
    );
  }

  public listEntries(
    where: { clientId: number; folderId: number | null },
    query?: { page?: number; search?: string },
  ) {
    const { folderId } = where;

    if (folderId === null) {
      return this.call(() =>
        http.api.clients[":clientId"].entries.$get({
          param: { clientId: where.clientId.toString() },
          query: { page: query?.page?.toString(), search: query?.search },
        }),
      );
    }

    return this.call(() =>
      http.api.clients[":clientId"].folders[":folderId"].entries.$get({
        param: {
          clientId: where.clientId.toString(),
          folderId: folderId.toString(),
        },
        query: {
          page: query?.page?.toString(),
          search: query?.search,
        },
      }),
    );
  }

  public getPath(where: { clientId: number; folderId: number }) {
    return this.call(() =>
      http.api.clients[":clientId"].folders[":folderId"].path.$get({
        param: {
          clientId: where.clientId.toString(),
          folderId: where.folderId.toString(),
        },
      }),
    );
  }

  public create(
    where: { clientId: number },
    input: { name: string; parentId?: number | null },
  ) {
    return this.call(() =>
      http.api.clients[":clientId"].folders.$post({
        param: { clientId: where.clientId.toString() },
        json: {
          name: input.name,
          parentId: input.parentId ?? undefined,
        },
      }),
    );
  }

  public update(
    where: { clientId: number; folderId: number },
    input: { name: string },
  ) {
    return this.call(() =>
      http.api.clients[":clientId"].folders[":folderId"].$patch({
        param: {
          clientId: where.clientId.toString(),
          folderId: where.folderId.toString(),
        },
        json: { name: input.name },
      }),
    );
  }

  public remove(where: { clientId: number; folderId: number }) {
    return this.call(() =>
      http.api.clients[":clientId"].folders[":folderId"].$delete({
        param: {
          clientId: where.clientId.toString(),
          folderId: where.folderId.toString(),
        },
      }),
    );
  }
}
