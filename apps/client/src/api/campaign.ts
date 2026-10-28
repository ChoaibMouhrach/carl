import type { InferRequestType } from "hono/client";
import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export type CreateCampaignInput = InferRequestType<
  typeof http.api.campaigns.$post
>["json"];

export type UpdateCampaignInput = InferRequestType<
  (typeof http.api.campaigns)[":campaignId"]["$patch"]
>["json"];

export type CampaignSort = "name" | "createdAt";

export class CampaignApi extends BaseApi {
  public list(query?: {
    page?: number;
    perPage?: number;
    search?: string;
    sort?: CampaignSort;
    order?: "asc" | "desc";
  }) {
    return this.call(() =>
      http.api.campaigns.$get({
        query: {
          page: query?.page?.toString(),
          perPage: query?.perPage?.toString(),
          search: query?.search,
          sort: query?.sort,
          order: query?.order,
        },
      }),
    );
  }

  public show(where: { campaignId: number }) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].$get({
        param: { campaignId: where.campaignId.toString() },
      }),
    );
  }

  public pipeline(where: { campaignId: number }) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].pipeline.$get({
        param: { campaignId: where.campaignId.toString() },
      }),
    );
  }

  public startScrape(where: { campaignId: number }) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].pipeline.scrape.$post({
        param: { campaignId: where.campaignId.toString() },
      }),
    );
  }

  public startEnrich(where: { campaignId: number }) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].pipeline.enrich.$post({
        param: { campaignId: where.campaignId.toString() },
      }),
    );
  }

  public create(input: CreateCampaignInput) {
    return this.call(() => http.api.campaigns.$post({ json: input }));
  }

  public update(where: { campaignId: number }, input: UpdateCampaignInput) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].$patch({
        param: { campaignId: where.campaignId.toString() },
        json: input,
      }),
    );
  }

  public addLeads(where: { campaignId: number }, input: { leadIds: number[] }) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].leads.$post({
        param: { campaignId: where.campaignId.toString() },
        json: input,
      }),
    );
  }

  public removeLeads(
    where: { campaignId: number },
    input: { leadIds: number[] },
  ) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].leads.remove.$post({
        param: { campaignId: where.campaignId.toString() },
        json: input,
      }),
    );
  }

  public addCommunities(
    where: { campaignId: number },
    input: { communityIds: number[] },
  ) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].communities.$post({
        param: { campaignId: where.campaignId.toString() },
        json: input,
      }),
    );
  }

  public removeCommunities(
    where: { campaignId: number },
    input: { communityIds: number[] },
  ) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].communities.remove.$post({
        param: { campaignId: where.campaignId.toString() },
        json: input,
      }),
    );
  }

  public remove(where: { campaignId: number }) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].$delete({
        param: { campaignId: where.campaignId.toString() },
      }),
    );
  }
}
