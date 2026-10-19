import { BaseService } from "@server/lib/base-service";
import { ConflictError, NotFoundError } from "@server/lib/errors";
import type { LeadSortBy } from "@server/repositories/lead";
import type { LeadInsert } from "@server/infrastructure/database/schemas";

type LeadFields = Omit<LeadInsert, "leadId" | "createdAt" | "updatedAt">;

export class LeadService extends BaseService {
  public async list(query: {
    page?: number;
    search?: string;
    hasWebsite?: boolean;
    sortBy?: LeadSortBy;
    sortOrder?: "asc" | "desc";
  }) {
    const page = query.page || 1;

    const { leads, lastPage } = await this.context.repositories.lead.list({
      page,
      search: query.search,
      hasWebsite: query.hasWebsite,
      sortBy: query.sortBy ?? "createdAt",
      sortOrder: query.sortOrder ?? "desc",
    });

    return { leads, meta: { page, lastPage } };
  }

  public async show(input: { leadId: number }) {
    const lead = await this.findOrFail(input.leadId);

    const communities =
      await this.context.repositories.community.findAllByLeadId({
        leadId: input.leadId,
      });

    return { lead, communities };
  }

  public async create(input: LeadFields) {
    const existing = await this.context.repositories.lead.findBySkoolUsername({
      skoolUsername: input.skoolUsername,
    });

    if (existing) {
      throw new ConflictError({
        message: "A lead with this Skool username already exists.",
      });
    }

    const lead = await this.context.repositories.lead.create(input);

    await this.context.eventBus.publish("leads.changed");

    return lead;
  }

  public async update(
    input: { leadId: number },
    fields: Partial<Omit<LeadFields, "skoolUsername">>,
  ) {
    await this.findOrFail(input.leadId);

    await this.context.repositories.lead.update(
      { leadId: input.leadId },
      fields,
    );
    await this.context.eventBus.publish("leads.changed", "communities.changed");

    return await this.findOrFail(input.leadId);
  }

  public async remove(input: { leadId: number }): Promise<void> {
    await this.findOrFail(input.leadId);

    await this.context.repositories.lead.removeByLeadId({
      leadId: input.leadId,
    });

    // Deleting a lead removes its communities and its place in every campaign
    await this.context.eventBus.publish(
      "leads.changed",
      "communities.changed",
      "campaigns.changed",
    );
  }

  private async findOrFail(leadId: number) {
    const lead = await this.context.repositories.lead.findByLeadId({ leadId });

    if (!lead) {
      throw new NotFoundError({ message: "Lead not found." });
    }

    return lead;
  }
}
