import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export class ClientApi extends BaseApi {
  public list(query?: { page?: number; search?: string }) {
    return this.call(() =>
      http.api.clients.$get({
        query: {
          page: query?.page?.toString(),
          search: query?.search,
        },
      }),
    );
  }

  public create(input: { name: string; email: string }) {
    return this.call(() =>
      http.api.clients.$post({
        json: {
          name: input.name,
          email: input.email,
        },
      }),
    );
  }

  public update(
    where: { clientId: number },
    input: { name: string; email: string },
  ) {
    return this.call(() =>
      http.api.clients[":clientId"].$patch({
        param: { clientId: where.clientId.toString() },
        json: {
          name: input.name,
          email: input.email,
        },
      }),
    );
  }

  public remove(where: { clientId: number }) {
    return this.call(() =>
      http.api.clients[":clientId"].$delete({
        param: { clientId: where.clientId.toString() },
      }),
    );
  }
}
