import {
  stageNumbers,
  type CampaignStatus,
  type LeadStatus,
  type StageNumber,
} from "@repo/constants/campaign";
import { DEFAULT_SKOOL_SEARCHES } from "@server/config/constants";
import type { DiscoveryCriteria } from "@server/lib/skool-discovery";
import { BaseService } from "@server/lib/base-service";
import { NotFoundError } from "@server/lib/errors";

const SCRAPE_RUN_HISTORY_LIMIT = 10;

interface StageCount {
  stage: StageNumber;
  total: number;
  ready: number;
  pending: number;
  running: number;
  done: number;
  failed: number;
}

interface CountRow {
  stage: StageNumber;
  status: LeadStatus;
  count: number;
}

// A lead is ready for a stage when it waits there, or finished the stage before
const buildStageCounts = (rows: CountRow[]): StageCount[] => {
  const countOf = (stage: number, status: LeadStatus) =>
    rows.find((row) => row.stage === stage && row.status === status)?.count ??
    0;

  return stageNumbers.map((stage) => {
    const pending = countOf(stage, "pending");
    const running = countOf(stage, "running");
    const done = countOf(stage, "done");
    const failed = countOf(stage, "failed");

    return {
      stage,
      total: pending + running + done + failed,
      ready: pending + countOf(stage - 1, "done"),
      pending,
      running,
      done,
      failed,
    };
  });
};

export class CampaignService extends BaseService {
  public async list(query: {
    page?: number;
    search?: string;
    status?: CampaignStatus;
  }) {
    const page = query.page || 1;

    const { campaigns, lastPage } =
      await this.context.repositories.campaign.list({
        page,
        search: query.search,
        status: query.status,
      });

    const counts =
      await this.context.repositories.campaignLead.countByStageAndStatus({
        campaignIds: campaigns.map((campaign) => campaign.campaignId),
      });

    return {
      campaigns: campaigns.map((campaign) => ({
        ...campaign,
        stages: buildStageCounts(
          counts.filter((row) => row.campaignId === campaign.campaignId),
        ),
      })),
      meta: { page, lastPage },
    };
  }

  public async show(input: { campaignId: number }) {
    const campaign = await this.findOrFail(input.campaignId);

    const [counts, scrapeRuns] = await Promise.all([
      this.context.repositories.campaignLead.countByStageAndStatus({
        campaignIds: [campaign.campaignId],
      }),
      this.context.repositories.scrapeRun.listByCampaignId({
        campaignId: campaign.campaignId,
        limit: SCRAPE_RUN_HISTORY_LIMIT,
      }),
    ]);

    const stages = buildStageCounts(counts);

    return {
      campaign: {
        ...campaign,
        leadCount: stages.reduce((total, stage) => total + stage.total, 0),
        stages,
      },
      scrapeRuns,
    };
  }

  public async listLeads(
    input: { campaignId: number },
    query: {
      page?: number;
      search?: string;
      stage?: StageNumber;
      status?: LeadStatus;
    },
  ) {
    await this.findOrFail(input.campaignId);

    const page = query.page || 1;

    const { leads, lastPage } =
      await this.context.repositories.campaignLead.list({
        campaignId: input.campaignId,
        page,
        search: query.search,
        stage: query.stage,
        status: query.status,
      });

    return { leads, meta: { page, lastPage } };
  }

  public async create(input: {
    name: string;
    description?: string | null;
    keyword: string;
    searches?: DiscoveryCriteria[];
  }) {
    return await this.context.repositories.campaign.create({
      name: input.name,
      description: input.description,
      keyword: input.keyword,
      searches: input.searches ?? DEFAULT_SKOOL_SEARCHES,
    });
  }

  public async update(
    input: { campaignId: number },
    fields: {
      name?: string;
      description?: string | null;
      keyword?: string;
      searches?: DiscoveryCriteria[];
      status?: CampaignStatus;
    },
  ) {
    await this.findOrFail(input.campaignId);

    await this.context.repositories.campaign.update(input, fields);

    return await this.findOrFail(input.campaignId);
  }

  public async remove(input: { campaignId: number }): Promise<void> {
    await this.findOrFail(input.campaignId);

    await this.context.repositories.campaign.removeByCampaignId(input);
  }

  private async findOrFail(campaignId: number) {
    const campaign = await this.context.repositories.campaign.findByCampaignId({
      campaignId,
    });

    if (!campaign) {
      throw new NotFoundError({ message: "Campaign not found." });
    }

    return campaign;
  }
}
