import {
  skoolPriceFilters,
  skoolVisibilities,
  stageNumbers,
  type CampaignStatus,
  type LeadStatus,
  type SkoolPriceFilter,
  type SkoolVisibility,
  type StageNumber,
} from "@repo/constants/campaign";
import {
  csvFilename,
  EXPORT_FETCH_LIMIT,
  toCsv,
  withinExportLimit,
} from "@server/lib/csv";
import { BaseService } from "@server/lib/base-service";
import { BadRequestError, NotFoundError } from "@server/lib/errors";

const SCRAPE_RUN_HISTORY_LIMIT = 10;

// A campaign is activated once, can be paused and resumed, and ends as completed
const allowedStatusChanges: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ["active"],
  active: ["paused", "completed"],
  paused: ["active", "completed"],
  completed: [],
};

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

  public async exportCsv(query: { search?: string; status?: CampaignStatus }) {
    const { campaigns } = await this.context.repositories.campaign.list({
      page: 1,
      limit: EXPORT_FETCH_LIMIT,
      search: query.search,
      status: query.status,
    });

    const csv = toCsv(
      [
        { header: "Name", value: (campaign) => campaign.name },
        { header: "Description", value: (campaign) => campaign.description },
        { header: "Status", value: (campaign) => campaign.status },
        { header: "Keywords", value: (campaign) => campaign.keywords },
        { header: "Types", value: (campaign) => campaign.types },
        {
          header: "Pricing models",
          value: (campaign) => campaign.pricingModels,
        },
        {
          header: "Min price per month (USD)",
          value: (campaign) => campaign.minMonthlyPriceUsd,
        },
        {
          header: "Max price per month (USD)",
          value: (campaign) => campaign.maxMonthlyPriceUsd,
        },
        { header: "Min members", value: (campaign) => campaign.minMembers },
        { header: "Max members", value: (campaign) => campaign.maxMembers },
        { header: "Leads", value: (campaign) => campaign.leadCount },
        { header: "Created", value: (campaign) => campaign.createdAt },
        { header: "Updated", value: (campaign) => campaign.updatedAt },
      ],
      withinExportLimit(campaigns),
    );

    return { csv, filename: csvFilename("campaigns") };
  }

  public async exportLeadsCsv(
    input: { campaignId: number },
    query: { search?: string; stage?: StageNumber; status?: LeadStatus },
  ) {
    const campaign = await this.findOrFail(input.campaignId);

    const { leads } = await this.context.repositories.campaignLead.list({
      campaignId: input.campaignId,
      page: 1,
      limit: EXPORT_FETCH_LIMIT,
      search: query.search,
      stage: query.stage,
      status: query.status,
    });

    const csv = toCsv(
      [
        { header: "Lead", value: (lead) => lead.name },
        { header: "Skool username", value: (lead) => lead.skoolUsername },
        { header: "Community", value: (lead) => lead.communityName },
        {
          header: "Community description",
          value: (lead) => lead.communityDescription,
        },
        { header: "Members", value: (lead) => lead.memberCount },
        { header: "Keyword", value: (lead) => lead.keyword },
        { header: "Emails", value: (lead) => lead.emails },
        { header: "LinkedIn", value: (lead) => lead.linkedinUrl },
        { header: "Website", value: (lead) => lead.website },
        { header: "Stage", value: (lead) => lead.stage },
        { header: "Status", value: (lead) => lead.status },
        { header: "Failure reason", value: (lead) => lead.failureReason },
        { header: "Updated", value: (lead) => lead.updatedAt },
      ],
      withinExportLimit(leads),
    );

    return {
      csv,
      filename: csvFilename(`campaign-${campaign.campaignId}-leads`),
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
    keywords: string[];
    types?: SkoolVisibility[];
    pricingModels?: SkoolPriceFilter[];
    minMonthlyPriceUsd?: number | null;
    maxMonthlyPriceUsd?: number | null;
    minMembers?: number | null;
    maxMembers?: number | null;
  }) {
    const campaign = await this.context.repositories.campaign.create({
      name: input.name,
      description: input.description,
      keywords: input.keywords,
      types: input.types ?? [...skoolVisibilities],
      pricingModels: input.pricingModels ?? [...skoolPriceFilters],
      minMonthlyPriceUsd: input.minMonthlyPriceUsd,
      maxMonthlyPriceUsd: input.maxMonthlyPriceUsd,
      minMembers: input.minMembers,
      maxMembers: input.maxMembers,
    });

    await this.context.eventBus.publish("campaigns.changed");

    return campaign;
  }

  public async update(
    input: { campaignId: number },
    fields: {
      name?: string;
      description?: string | null;
      keywords?: string[];
      types?: SkoolVisibility[];
      pricingModels?: SkoolPriceFilter[];
      minMonthlyPriceUsd?: number | null;
      maxMonthlyPriceUsd?: number | null;
      minMembers?: number | null;
      maxMembers?: number | null;
      status?: CampaignStatus;
    },
  ) {
    const current = await this.findOrFail(input.campaignId);

    if (
      fields.status &&
      fields.status !== current.status &&
      !allowedStatusChanges[current.status].includes(fields.status)
    ) {
      throw new BadRequestError({
        message: `A ${current.status} campaign cannot become ${fields.status}.`,
      });
    }

    // A request may change only one end of a range, so the stored other end counts too
    const pick = <
      Key extends
        | "minMembers"
        | "maxMembers"
        | "minMonthlyPriceUsd"
        | "maxMonthlyPriceUsd",
    >(
      key: Key,
    ) => (fields[key] !== undefined ? fields[key] : current[key]);
    const crossed = (
      min: number | null | undefined,
      max: number | null | undefined,
    ) => min != null && max != null && min > max;

    if (
      crossed(pick("minMembers"), pick("maxMembers")) ||
      crossed(pick("minMonthlyPriceUsd"), pick("maxMonthlyPriceUsd"))
    ) {
      throw new BadRequestError({
        message: "Minimum cannot be greater than maximum.",
      });
    }

    await this.context.repositories.campaign.update(input, fields);
    await this.context.eventBus.publish("campaigns.changed");

    return await this.findOrFail(input.campaignId);
  }

  public async remove(input: { campaignId: number }): Promise<void> {
    await this.findOrFail(input.campaignId);

    await this.context.repositories.campaign.removeByCampaignId(input);
    await this.context.eventBus.publish("campaigns.changed");
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
