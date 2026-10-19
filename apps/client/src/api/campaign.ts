import type { InferRequestType } from "hono/client";
import type { CampaignStatus, LeadStatus, StageNumber } from "@/lib/campaign";
import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export type CreateCampaignInput = InferRequestType<
  typeof http.api.campaigns.$post
>["json"];

export type UpdateCampaignInput = InferRequestType<
  (typeof http.api.campaigns)[":campaignId"]["$patch"]
>["json"];

export class CampaignApi extends BaseApi {
  public list(query?: {
    page?: number;
    search?: string;
    status?: CampaignStatus;
  }) {
    return this.call(() =>
      http.api.campaigns.$get({
        query: {
          page: query?.page?.toString(),
          search: query?.search,
          status: query?.status,
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

  public leads(
    where: { campaignId: number },
    query?: {
      page?: number;
      search?: string;
      stage?: StageNumber;
      status?: LeadStatus;
    },
  ) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].leads.$get({
        param: { campaignId: where.campaignId.toString() },
        query: {
          page: query?.page?.toString(),
          search: query?.search,
          stage: query?.stage?.toString(),
          status: query?.status,
        },
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

  public remove(where: { campaignId: number }) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].$delete({
        param: { campaignId: where.campaignId.toString() },
      }),
    );
  }

  public scrape(where: { campaignId: number }) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].scrape.$post({
        param: { campaignId: where.campaignId.toString() },
      }),
    );
  }
}

type ShowResult = Awaited<ReturnType<CampaignApi["show"]>>;

export type CampaignSummary = Awaited<
  ReturnType<CampaignApi["list"]>
>["campaigns"][number];
export type CampaignDetail = ShowResult["campaign"];
export type ScrapeRun = ShowResult["scrapeRuns"][number];
export type StageCount = CampaignDetail["stages"][number];
export type CampaignLead = Awaited<
  ReturnType<CampaignApi["leads"]>
>["leads"][number];
