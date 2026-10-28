import type { InferRequestType } from "hono/client";
import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export type CreateLeadInput = InferRequestType<
  typeof http.api.leads.$post
>["json"];

export type UpdateLeadInput = InferRequestType<
  (typeof http.api.leads)[":leadId"]["$patch"]
>["json"];

export type LeadSort = "name" | "username" | "createdAt";

export class LeadApi extends BaseApi {
  public list(query?: {
    page?: number;
    perPage?: number;
    search?: string;
    hasEmail?: boolean;
    campaignId?: number;
    sort?: LeadSort;
    order?: "asc" | "desc";
  }) {
    return this.call(() =>
      http.api.leads.$get({
        query: {
          page: query?.page?.toString(),
          perPage: query?.perPage?.toString(),
          search: query?.search,
          hasEmail: query?.hasEmail?.toString(),
          campaignId: query?.campaignId?.toString(),
          sort: query?.sort,
          order: query?.order,
        },
      }),
    );
  }

  public show(where: { leadId: number }) {
    return this.call(() =>
      http.api.leads[":leadId"].$get({
        param: { leadId: where.leadId.toString() },
      }),
    );
  }

  public create(input: CreateLeadInput) {
    return this.call(() => http.api.leads.$post({ json: input }));
  }

  public update(where: { leadId: number }, input: UpdateLeadInput) {
    return this.call(() =>
      http.api.leads[":leadId"].$patch({
        param: { leadId: where.leadId.toString() },
        json: input,
      }),
    );
  }

  public removeMany(input: { leadIds: number[] }) {
    return this.call(() =>
      http.api.leads["bulk-delete"].$post({ json: input }),
    );
  }

  public remove(where: { leadId: number }) {
    return this.call(() =>
      http.api.leads[":leadId"].$delete({
        param: { leadId: where.leadId.toString() },
      }),
    );
  }
}
