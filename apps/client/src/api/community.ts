import type { InferRequestType } from "hono/client";
import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export type CreateCommunityInput = InferRequestType<
  typeof http.api.communities.$post
>["json"];

export type UpdateCommunityInput = Partial<
  Omit<CreateCommunityInput, "skoolId">
>;

export class CommunityApi extends BaseApi {
  public list(query?: {
    page?: number;
    search?: string;
    pricingType?: "free" | "paid";
    leadId?: number;
    minMembers?: number;
    minRevenue?: number;
    sortBy?: "estMonthlyRevenue" | "memberCount" | "createdAt" | "name";
    sortOrder?: "asc" | "desc";
  }) {
    return this.call(() =>
      http.api.communities.$get({
        query: {
          page: query?.page?.toString(),
          search: query?.search,
          pricingType: query?.pricingType,
          leadId: query?.leadId?.toString(),
          minMembers: query?.minMembers?.toString(),
          minRevenue: query?.minRevenue?.toString(),
          sortBy: query?.sortBy,
          sortOrder: query?.sortOrder,
        },
      }),
    );
  }

  public export(query?: {
    search?: string;
    pricingType?: "free" | "paid";
    leadId?: number;
    minMembers?: number;
    minRevenue?: number;
    sortBy?: "estMonthlyRevenue" | "memberCount" | "createdAt" | "name";
    sortOrder?: "asc" | "desc";
  }) {
    return this.download(() =>
      http.api.communities.export.$get({
        query: {
          search: query?.search,
          pricingType: query?.pricingType,
          leadId: query?.leadId?.toString(),
          minMembers: query?.minMembers?.toString(),
          minRevenue: query?.minRevenue?.toString(),
          sortBy: query?.sortBy,
          sortOrder: query?.sortOrder,
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

  public remove(where: { communityId: number }) {
    return this.call(() =>
      http.api.communities[":communityId"].$delete({
        param: { communityId: where.communityId.toString() },
      }),
    );
  }
}
