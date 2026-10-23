import type { InferRequestType } from "hono/client";
import type {
  CampaignStatus,
  LeadStatus,
  RerunScope,
  StageNumber,
} from "@/lib/campaign";
import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export type CreateCampaignInput = InferRequestType<
  typeof http.api.campaigns.$post
>["json"];

export type UpdateCampaignInput = InferRequestType<
  (typeof http.api.campaigns)[":campaignId"]["$patch"]
>["json"];

export type SaveFilterInput = InferRequestType<
  (typeof http.api.campaigns)[":campaignId"]["filter"]["$put"]
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

  public export(query?: { search?: string; status?: CampaignStatus }) {
    return this.download(() =>
      http.api.campaigns.export.$get({
        query: { search: query?.search, status: query?.status },
      }),
    );
  }

  public exportLeads(
    where: { campaignId: number },
    query?: { search?: string; stage?: StageNumber; status?: LeadStatus },
  ) {
    return this.download(() =>
      http.api.campaigns[":campaignId"].leads.export.$get({
        param: { campaignId: where.campaignId.toString() },
        query: {
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

  public scrape(
    where: { campaignId: number },
    options?: { replace?: boolean },
  ) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].scrape.$post({
        param: { campaignId: where.campaignId.toString() },
        query: { replace: options?.replace ? "true" : undefined },
      }),
    );
  }

  public filter(where: { campaignId: number }) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].filter.$get({
        param: { campaignId: where.campaignId.toString() },
      }),
    );
  }

  public saveFilter(where: { campaignId: number }, input: SaveFilterInput) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].filter.$put({
        param: { campaignId: where.campaignId.toString() },
        json: input,
      }),
    );
  }

  public promptFilter(where: { campaignId: number }, input: SaveFilterInput) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].filter.prompt.$post({
        param: { campaignId: where.campaignId.toString() },
        json: input,
      }),
    );
  }

  public runFilter(where: { campaignId: number }) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].filter.run.$post({
        param: { campaignId: where.campaignId.toString() },
      }),
    );
  }

  public reapplyFilter(where: { campaignId: number }) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].filter.reapply.$post({
        param: { campaignId: where.campaignId.toString() },
      }),
    );
  }

  public runEnrich(where: { campaignId: number }) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].enrich.run.$post({
        param: { campaignId: where.campaignId.toString() },
      }),
    );
  }

  public runFindEmail(where: { campaignId: number }) {
    return this.call(() =>
      http.api.campaigns[":campaignId"]["find-email"].run.$post({
        param: { campaignId: where.campaignId.toString() },
      }),
    );
  }

  public rerun(
    where: { campaignId: number },
    input:
      | { stage: 2 | 3 | 4; leadIds: number[] }
      | { stage: 4; scope: RerunScope },
  ) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].rerun.$post({
        param: { campaignId: where.campaignId.toString() },
        json: input,
      }),
    );
  }

  public assessment(where: { campaignId: number; leadId: number }) {
    return this.call(() =>
      http.api.campaigns[":campaignId"].leads[":leadId"].assessment.$get({
        param: {
          campaignId: where.campaignId.toString(),
          leadId: where.leadId.toString(),
        },
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

export type FilterSettings = Awaited<ReturnType<CampaignApi["filter"]>>;
export type LeadAssessment = Awaited<
  ReturnType<CampaignApi["assessment"]>
>["assessment"];
export type FilterPrompt = Awaited<ReturnType<CampaignApi["promptFilter"]>>;
