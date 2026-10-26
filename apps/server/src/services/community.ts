import { BaseService } from "@server/lib/base-service";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@server/lib/errors";
import type {
  Community,
  CommunityInsert,
} from "@server/infrastructure/database/schemas";

interface ListCommunitiesInput {
  page: number;
  perPage: number;
  search?: string;
  leadId?: number;
  campaignId?: number;
  isFree?: boolean;
  hasEmail?: boolean;
  minMembers?: number;
  maxMembers?: number;
  minMrr?: number;
  maxMrr?: number;
  sort: "name" | "members" | "mrr" | "priceCents" | "createdAt";
  order: "asc" | "desc";
}

type CreateCommunityInput = Omit<
  CommunityInsert,
  "communityId" | "createdAt" | "updatedAt"
>;

export class CommunityService extends BaseService {
  public async list(input: ListCommunitiesInput) {
    const { page, perPage, ...filters } = input;

    const { communities, total } =
      await this.context.repositories.community.list({
        ...filters,
        limit: perPage,
        offset: (page - 1) * perPage,
      });

    return {
      communities,
      meta: {
        page,
        perPage,
        lastPage: Math.max(1, Math.ceil(total / perPage)),
        total,
      },
    };
  }

  public async get(where: { communityId: number }) {
    const community =
      await this.context.repositories.community.findByCommunityId(where);

    if (!community) {
      throw this.notFound();
    }

    const lead = await this.context.repositories.lead.findByLeadId({
      leadId: community.leadId,
    });

    return { ...community, lead };
  }

  public async create(input: CreateCommunityInput) {
    this.assertPricing(input);
    await this.assertLeadExists(input.leadId);
    await this.assertUnique({ skoolUrl: input.skoolUrl });

    return await this.context.repositories.community.create(input);
  }

  public async update(
    where: { communityId: number },
    input: Partial<CreateCommunityInput>,
  ) {
    const community =
      await this.context.repositories.community.findByCommunityId(where);

    if (!community) {
      throw this.notFound();
    }

    this.assertPricing({ ...community, ...input });

    if (input.leadId !== undefined) {
      await this.assertLeadExists(input.leadId);
    }

    await this.assertUnique(input, where.communityId);
    await this.context.repositories.community.update(where, input);

    const updated =
      await this.context.repositories.community.findByCommunityId(where);

    return updated ?? community;
  }

  public async removeMany(input: {
    communityIds: number[];
  }): Promise<{ deleted: number }> {
    // One statement, so the whole batch goes or none of it does
    const deleted =
      await this.context.repositories.community.removeByCommunityIds({
        communityIds: [...new Set(input.communityIds)],
      });

    return { deleted };
  }

  public async remove(where: { communityId: number }): Promise<void> {
    const community =
      await this.context.repositories.community.findByCommunityId(where);

    if (!community) {
      throw this.notFound();
    }

    await this.context.repositories.community.removeByCommunityId(where);
  }

  // A free community has no price; a paid one needs the full price
  private assertPricing(
    state: Pick<Community, "isFree"> &
      Partial<
        Pick<Community, "priceCents" | "priceCurrency" | "priceInterval">
      >,
  ) {
    const priced = [
      state.priceCents,
      state.priceCurrency,
      state.priceInterval,
    ].map((value) => value !== null && value !== undefined);

    const valid = state.isFree
      ? priced.every((isSet) => !isSet)
      : priced.every((isSet) => isSet);

    if (!valid) {
      throw new BadRequestError({
        message:
          "A free community has no price, and a paid one needs an amount, currency and interval.",
        code: "invalidCommunityPricing",
      });
    }
  }

  private async assertLeadExists(leadId: number) {
    const lead = await this.context.repositories.lead.findByLeadId({ leadId });

    if (!lead) {
      throw new NotFoundError({
        message: "Lead not found.",
        code: "leadNotFound",
      });
    }
  }

  private async assertUnique(
    input: { skoolUrl?: string },
    exceptCommunityId?: number,
  ) {
    if (input.skoolUrl === undefined) {
      return;
    }

    const taken = await this.context.repositories.community.findBySkoolUrl({
      skoolUrl: input.skoolUrl,
    });

    if (taken && taken.communityId !== exceptCommunityId) {
      throw new ConflictError({
        message: "A community with that Skool URL already exists.",
        code: "communitySkoolUrlTaken",
      });
    }
  }

  private notFound() {
    return new NotFoundError({
      message: "Community not found.",
      code: "communityNotFound",
    });
  }
}
