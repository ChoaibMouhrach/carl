import type { InferRequestType } from "hono/client";
import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export type CreateLeadInput = InferRequestType<
  typeof http.api.leads.$post
>["json"];

export type UpdateLeadInput = InferRequestType<
  (typeof http.api.leads)[":leadId"]["$patch"]
>["json"];

export class LeadApi extends BaseApi {
  public list(query?: {
    page?: number;
    search?: string;
    hasWebsite?: boolean;
    sortBy?: "createdAt" | "name" | "communityCount";
    sortOrder?: "asc" | "desc";
  }) {
    return this.call(() =>
      http.api.leads.$get({
        query: {
          page: query?.page?.toString(),
          search: query?.search,
          hasWebsite: query?.hasWebsite?.toString(),
          sortBy: query?.sortBy,
          sortOrder: query?.sortOrder,
        },
      }),
    );
  }

  public export(query?: {
    search?: string;
    hasWebsite?: boolean;
    sortBy?: "createdAt" | "name" | "communityCount";
    sortOrder?: "asc" | "desc";
  }) {
    return this.download(() =>
      http.api.leads.export.$get({
        query: {
          search: query?.search,
          hasWebsite: query?.hasWebsite?.toString(),
          sortBy: query?.sortBy,
          sortOrder: query?.sortOrder,
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

  public remove(where: { leadId: number }) {
    return this.call(() =>
      http.api.leads[":leadId"].$delete({
        param: { leadId: where.leadId.toString() },
      }),
    );
  }
}
