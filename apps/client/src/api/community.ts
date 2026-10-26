import type { InferRequestType } from "hono/client";
import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export type CreateCommunityInput = InferRequestType<
  typeof http.api.communities.$post
>["json"];

export type UpdateCommunityInput = InferRequestType<
  (typeof http.api.communities)[":communityId"]["$patch"]
>["json"];

export type CommunitySort =
  | "name"
  | "members"
  | "mrr"
  | "priceCents"
  | "createdAt";

export interface CommunityListQuery {
  page?: number;
  perPage?: number;
  search?: string;
  leadId?: number;
  isFree?: boolean;
  hasEmail?: boolean;
  minMembers?: number;
  maxMembers?: number;
  minMrr?: number;
  maxMrr?: number;
  sort?: CommunitySort;
  order?: "asc" | "desc";
}

export class CommunityApi extends BaseApi {
  public list(query?: CommunityListQuery) {
    return this.call(() =>
      http.api.communities.$get({
        query: {
          page: query?.page?.toString(),
          perPage: query?.perPage?.toString(),
          search: query?.search,
          leadId: query?.leadId?.toString(),
          isFree: query?.isFree?.toString(),
          hasEmail: query?.hasEmail?.toString(),
          minMembers: query?.minMembers?.toString(),
          maxMembers: query?.maxMembers?.toString(),
          minMrr: query?.minMrr?.toString(),
          maxMrr: query?.maxMrr?.toString(),
          sort: query?.sort,
          order: query?.order,
        },
      }),
    );
  }

  public show(where: { communityId: number }) {
    return this.call(() =>
      http.api.communities[":communityId"].$get({
        param: { communityId: where.communityId.toString() },
      }),
    );
  }

  public create(input: CreateCommunityInput) {
    return this.call(() => http.api.communities.$post({ json: input }));
  }

  public update(where: { communityId: number }, input: UpdateCommunityInput) {
    return this.call(() =>
      http.api.communities[":communityId"].$patch({
        param: { communityId: where.communityId.toString() },
        json: input,
      }),
    );
  }

  public removeMany(input: { communityIds: number[] }) {
    return this.call(() =>
      http.api.communities["bulk-delete"].$post({ json: input }),
    );
  }

  public remove(where: { communityId: number }) {
    return this.call(() =>
      http.api.communities[":communityId"].$delete({
        param: { communityId: where.communityId.toString() },
      }),
    );
  }
}
