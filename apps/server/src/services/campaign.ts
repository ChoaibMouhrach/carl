import { BaseService } from "@server/lib/base-service";
import { NotFoundError } from "@server/lib/errors";
import type { CampaignInsert } from "@server/infrastructure/database/schemas";

interface ListCampaignsInput {
  page: number;
  perPage: number;
  search?: string;
  sort: "name" | "createdAt";
  order: "asc" | "desc";
}

type CreateCampaignInput = Omit<
  CampaignInsert,
  "campaignId" | "createdAt" | "updatedAt"
>;

export class CampaignService extends BaseService {
  public async list(input: ListCampaignsInput) {
    const { page, perPage, ...filters } = input;

    const { campaigns, total } = await this.context.repositories.campaign.list({
      ...filters,
      limit: perPage,
      offset: (page - 1) * perPage,
    });

    return {
      campaigns,
      meta: {
        page,
        perPage,
        lastPage: Math.max(1, Math.ceil(total / perPage)),
        total,
      },
    };
  }

  public async get(where: { campaignId: number }) {
    const campaign =
      await this.context.repositories.campaign.findByCampaignId(where);

    if (!campaign) {
      throw this.notFound();
    }

    return campaign;
  }

  public async create(input: CreateCampaignInput) {
    const campaign = await this.context.repositories.campaign.create(input);

    return await this.get({ campaignId: campaign.campaignId });
  }

  public async update(
    where: { campaignId: number },
    input: Partial<CreateCampaignInput>,
  ) {
    await this.get(where);
    await this.context.repositories.campaign.update(where, input);

    return await this.get(where);
  }

  public async removeMany(input: {
    campaignIds: number[];
  }): Promise<{ deleted: number }> {
    // One statement, so the whole batch goes or none of it does
    const deleted =
      await this.context.repositories.campaign.removeByCampaignIds({
        campaignIds: [...new Set(input.campaignIds)],
      });

    return { deleted };
  }

  public async remove(where: { campaignId: number }): Promise<void> {
    await this.get(where);
    await this.context.repositories.campaign.removeByCampaignId(where);
  }

  public async addLeads(input: { campaignId: number; leadIds: number[] }) {
    await this.get({ campaignId: input.campaignId });

    const leadIds = [...new Set(input.leadIds)];
    await this.assertLeadsExist(leadIds);

    const added = await this.context.repositories.campaign.addLeads({
      campaignId: input.campaignId,
      leadIds,
    });

    return { added };
  }

  public async removeLeads(input: { campaignId: number; leadIds: number[] }) {
    await this.get({ campaignId: input.campaignId });

    const removed = await this.context.repositories.campaign.removeLeads({
      campaignId: input.campaignId,
      leadIds: [...new Set(input.leadIds)],
    });

    return { removed };
  }

  public async addCommunities(input: {
    campaignId: number;
    communityIds: number[];
  }) {
    await this.get({ campaignId: input.campaignId });

    const communityIds = [...new Set(input.communityIds)];
    await this.assertCommunitiesExist(communityIds);

    const added = await this.context.repositories.campaign.addCommunities({
      campaignId: input.campaignId,
      communityIds,
    });

    return { added };
  }

  public async removeCommunities(input: {
    campaignId: number;
    communityIds: number[];
  }) {
    await this.get({ campaignId: input.campaignId });

    const removed = await this.context.repositories.campaign.removeCommunities({
      campaignId: input.campaignId,
      communityIds: [...new Set(input.communityIds)],
    });

    return { removed };
  }

  private async assertLeadsExist(leadIds: number[]) {
    const found = await this.context.repositories.lead.findAllByLeadIds({
      leadIds,
    });

    if (found.length !== leadIds.length) {
      throw new NotFoundError({
        message: "Lead not found.",
        code: "leadNotFound",
      });
    }
  }

  private async assertCommunitiesExist(communityIds: number[]) {
    const found =
      await this.context.repositories.community.findAllByCommunityIds({
        communityIds,
      });

    if (found.length !== communityIds.length) {
      throw new NotFoundError({
        message: "Community not found.",
        code: "communityNotFound",
      });
    }
  }

  private notFound() {
    return new NotFoundError({
      message: "Campaign not found.",
      code: "campaignNotFound",
    });
  }
}
