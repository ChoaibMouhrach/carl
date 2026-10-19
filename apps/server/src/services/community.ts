import { BaseService } from "@server/lib/base-service";
import { derivePricing } from "@server/lib/pricing";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@server/lib/errors";
import type { CommunitySortBy } from "@server/repositories/community";
import type {
  CommunityInsert,
  CommunityPrice,
} from "@server/infrastructure/database/schemas";
import type { PriceInput } from "@server/http/validations/community";

type CommunityFields = Omit<
  CommunityInsert,
  | "communityId"
  | "createdAt"
  | "updatedAt"
  | "prices"
  | "pricingType"
  | "pricingInterval"
  | "priceAmount"
  | "priceCurrency"
  | "monthlyPriceUsd"
  | "estMonthlyRevenue"
> & { prices: PriceInput[] };

export class CommunityService extends BaseService {
  public async list(query: {
    page?: number;
    search?: string;
    pricingType?: CommunityPrice["type"];
    leadId?: number;
    minMembers?: number;
    minRevenue?: number;
    sortBy?: CommunitySortBy;
    sortOrder?: "asc" | "desc";
  }) {
    const page = query.page || 1;

    const { communities, lastPage } =
      await this.context.repositories.community.list({
        page,
        search: query.search,
        pricingType: query.pricingType,
        leadId: query.leadId,
        minMembers: query.minMembers,
        minRevenue: query.minRevenue,
        sortBy: query.sortBy ?? "estMonthlyRevenue",
        sortOrder: query.sortOrder ?? "desc",
      });

    return { communities, meta: { page, lastPage } };
  }

  public async show(input: { communityId: number }) {
    const community = await this.findOrFail(input.communityId);

    const lead = await this.context.repositories.lead.findByLeadId({
      leadId: community.leadId,
    });

    return { community, lead: lead! };
  }

  public async create(input: CommunityFields) {
    await this.assertLeadExists(input.leadId);

    const existing = await this.context.repositories.community.findBySkoolId({
      skoolId: input.skoolId,
    });

    if (existing) {
      throw new ConflictError({
        message: "A community with this Skool id already exists.",
      });
    }

    const community = await this.context.repositories.community.create({
      ...input,
      ...derivePricing(this.normalizePrices(input.prices), input.memberCount),
    });

    await this.context.eventBus.publish("communities.changed", "leads.changed");

    return community;
  }

  public async update(
    input: { communityId: number },
    fields: Partial<Omit<CommunityFields, "skoolId">>,
  ) {
    const current = await this.findOrFail(input.communityId);
    const { prices, ...rest } = fields;

    if (fields.leadId !== undefined) {
      await this.assertLeadExists(fields.leadId);
    }

    const pricing =
      prices !== undefined || fields.memberCount !== undefined
        ? derivePricing(
            this.normalizePrices(prices ?? current.prices),
            fields.memberCount ?? current.memberCount,
          )
        : {};

    await this.context.repositories.community.update(
      { communityId: input.communityId },
      { ...rest, ...pricing },
    );
    await this.context.eventBus.publish("communities.changed", "leads.changed");

    return await this.findOrFail(input.communityId);
  }

  public async remove(input: { communityId: number }): Promise<void> {
    await this.findOrFail(input.communityId);

    await this.context.repositories.community.removeByCommunityId({
      communityId: input.communityId,
    });
    await this.context.eventBus.publish("communities.changed", "leads.changed");
  }

  private async findOrFail(communityId: number) {
    const community =
      await this.context.repositories.community.findByCommunityId({
        communityId,
      });

    if (!community) {
      throw new NotFoundError({ message: "Community not found." });
    }

    return community;
  }

  private async assertLeadExists(leadId: number) {
    const lead = await this.context.repositories.lead.findByLeadId({ leadId });

    if (!lead) {
      throw new BadRequestError({ message: "Lead not found." });
    }
  }

  private normalizePrices(
    inputPrices: (PriceInput | CommunityPrice)[],
  ): CommunityPrice[] {
    return inputPrices.map((price) =>
      price.type === "free"
        ? { type: "free", interval: null, amount: 0, currency: null }
        : {
            type: "paid",
            interval: price.interval,
            amount: price.amount,
            currency: price.currency,
          },
    );
  }
}
