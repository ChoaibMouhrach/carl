import { ApiError } from "@/lib/base-api";
import {
  stageNumbers,
  type CampaignStatus,
  type LeadStatus,
  type StageNumber,
} from "@/lib/campaign";
import {
  createLeads,
  seedCampaigns,
  type CampaignLead,
  type CampaignRecord,
} from "./campaign-seed";

export type { CampaignLead };

export interface StageCount {
  stage: StageNumber;
  total: number;
  ready: number;
  pending: number;
  running: number;
  done: number;
  failed: number;
}

export interface Campaign {
  campaignId: number;
  name: string;
  description: string | null;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
  leadCount: number;
  stages: StageCount[];
}

interface PageMeta {
  page: number;
  lastPage: number;
  total: number;
}

export interface CampaignInput {
  name: string;
  description: string | null;
}

const campaignPageSize = 10;
const leadPageSize = 15;
const failureRate = 0.08;
const seededLeadCount = 24;

const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 350));

const paginate = <T>(items: T[], page: number, pageSize: number) => {
  const lastPage = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, lastPage);

  return {
    items: items.slice((current - 1) * pageSize, current * pageSize),
    meta: { page: current, lastPage, total: items.length } satisfies PageMeta,
  };
};

const isReady = (lead: CampaignLead, stage: StageNumber) =>
  (lead.stage === stage && lead.status === "pending") ||
  (lead.stage === stage - 1 && lead.status === "done");

const countStage = (leads: CampaignLead[], stage: StageNumber): StageCount => {
  const counts: Record<LeadStatus, number> = {
    pending: 0,
    running: 0,
    done: 0,
    failed: 0,
  };
  let total = 0;

  for (const lead of leads) {
    if (lead.stage === stage) {
      counts[lead.status] += 1;
      total += 1;
    }
  }

  return {
    stage,
    total,
    ready: leads.filter((lead) => isReady(lead, stage)).length,
    ...counts,
  };
};

const summarize = (record: CampaignRecord): Campaign => ({
  campaignId: record.campaignId,
  name: record.name,
  description: record.description,
  status: record.status,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  leadCount: record.leads.length,
  stages: stageNumbers.map((stage) => countStage(record.leads, stage)),
});

// In-memory until the server exposes campaigns; swap the bodies for http calls.
export class CampaignApi {
  private records = seedCampaigns();
  private nextCampaignId = this.records.length + 1;

  private find(campaignId: number) {
    const record = this.records.find((item) => item.campaignId === campaignId);

    if (!record) {
      throw new ApiError({ statusCode: 404, message: "Campaign not found" });
    }

    return record;
  }

  public async list(query: {
    page: number;
    search?: string;
    status?: CampaignStatus;
  }) {
    await wait();

    const search = query.search?.toLowerCase();
    const matches = this.records
      .filter(
        (record) =>
          (!query.status || record.status === query.status) &&
          (!search ||
            record.name.toLowerCase().includes(search) ||
            record.description?.toLowerCase().includes(search)),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const { items, meta } = paginate(matches, query.page, campaignPageSize);

    return { campaigns: items.map(summarize), meta };
  }

  public async show(where: { campaignId: number }) {
    await wait();

    return { campaign: summarize(this.find(where.campaignId)) };
  }

  public async leads(
    where: { campaignId: number },
    query: {
      page: number;
      search?: string;
      stage?: StageNumber;
      status?: LeadStatus;
    },
  ) {
    await wait();

    const search = query.search?.toLowerCase();
    const matches = this.find(where.campaignId)
      .leads.filter(
        (lead) =>
          (!query.stage || lead.stage === query.stage) &&
          (!query.status || lead.status === query.status) &&
          (!search ||
            lead.name.toLowerCase().includes(search) ||
            lead.skoolUsername.includes(search) ||
            lead.communityName.toLowerCase().includes(search)),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const { items, meta } = paginate(matches, query.page, leadPageSize);

    return { leads: items, meta };
  }

  public async create(input: CampaignInput) {
    await wait();

    const now = new Date().toISOString();
    const campaignId = this.nextCampaignId;
    this.nextCampaignId += 1;

    const record: CampaignRecord = {
      campaignId,
      name: input.name,
      description: input.description,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      leads: createLeads(
        seededLeadCount,
        campaignId * 7919,
        campaignId * 1000,
        true,
      ),
    };
    this.records.push(record);

    return { campaign: summarize(record) };
  }

  public async update(where: { campaignId: number }, input: CampaignInput) {
    await wait();

    const record = this.find(where.campaignId);
    record.name = input.name;
    record.description = input.description;
    record.updatedAt = new Date().toISOString();

    return { campaign: summarize(record) };
  }

  public async remove(where: { campaignId: number }) {
    await wait();

    const record = this.find(where.campaignId);
    this.records = this.records.filter((item) => item !== record);
  }

  public async setStatus(
    where: { campaignId: number },
    input: { status: CampaignStatus },
  ) {
    await wait();

    const record = this.find(where.campaignId);
    record.status = input.status;
    record.updatedAt = new Date().toISOString();

    return { campaign: summarize(record) };
  }

  public async runStage(where: { campaignId: number; stage: StageNumber }) {
    await wait();

    const record = this.find(where.campaignId);
    const now = new Date().toISOString();
    let processed = 0;

    for (const lead of record.leads) {
      if (!isReady(lead, where.stage)) continue;

      lead.stage = where.stage;
      lead.status = Math.random() < failureRate ? "failed" : "done";
      lead.updatedAt = now;
      processed += 1;
    }

    record.updatedAt = now;

    return { processed };
  }

  public async retryFailed(where: { campaignId: number; stage: StageNumber }) {
    await wait();

    const record = this.find(where.campaignId);
    const now = new Date().toISOString();

    for (const lead of record.leads) {
      if (lead.stage === where.stage && lead.status === "failed") {
        lead.status = "pending";
        lead.updatedAt = now;
      }
    }

    record.updatedAt = now;
  }
}
