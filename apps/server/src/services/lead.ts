import type { CampaignPipelineStep } from "@repo/constants/pipeline";
import { BaseService } from "@server/lib/base-service";
import { ConflictError, NotFoundError } from "@server/lib/errors";
import type { LeadInsert } from "@server/infrastructure/database/schemas";

interface ListLeadsInput {
  page: number;
  perPage: number;
  search?: string;
  hasEmail?: boolean;
  campaignId?: number;
  pipelineStep?: CampaignPipelineStep;
  sort: "name" | "username" | "createdAt";
  order: "asc" | "desc";
}

type CreateLeadInput = Omit<
  LeadInsert,
  "leadId" | "createdAt" | "updatedAt"
> & {
  emails?: string[];
};

export class LeadService extends BaseService {
  public async list(input: ListLeadsInput) {
    const { leads, total } = await this.context.repositories.lead.list({
      search: input.search,
      hasEmail: input.hasEmail,
      campaignId: input.campaignId,
      pipelineStep: input.pipelineStep,
      sort: input.sort,
      order: input.order,
      limit: input.perPage,
      offset: (input.page - 1) * input.perPage,
    });

    const emails = await this.context.repositories.leadEmail.findAllByLeadIds({
      leadIds: leads.map((lead) => lead.leadId),
    });

    return {
      leads: leads.map((lead) => ({
        ...lead,
        emails: emails.filter((email) => email.leadId === lead.leadId),
      })),
      meta: {
        page: input.page,
        perPage: input.perPage,
        lastPage: Math.max(1, Math.ceil(total / input.perPage)),
        total,
      },
    };
  }

  public async get(input: { leadId: number }) {
    const lead =
      await this.context.repositories.lead.findWithCommunitiesByLeadId(input);

    if (!lead) {
      throw this.notFound();
    }

    return lead;
  }

  public async create(input: CreateLeadInput) {
    await this.assertUnique(input);

    const { emails = [], ...fields } = input;

    return await this.context.repositories.transaction(async ({ tx }) => {
      const lead = await tx.lead.create(fields);
      await tx.leadEmail.addMany({
        leadId: lead.leadId,
        addresses: emails,
        source: "manual",
      });

      return lead;
    });
  }

  public async update(
    where: { leadId: number },
    input: Partial<CreateLeadInput>,
  ) {
    const lead = await this.context.repositories.lead.findByLeadId(where);

    if (!lead) {
      throw this.notFound();
    }

    await this.assertUnique(input, where.leadId);

    const { emails = [], ...fields } = input;

    await this.context.repositories.transaction(async ({ tx }) => {
      if (Object.keys(fields).length > 0) {
        await tx.lead.update(where, fields);
      }
      await tx.leadEmail.addMany({
        leadId: where.leadId,
        addresses: emails,
        source: "manual",
      });
    });

    const updated = await this.context.repositories.lead.findByLeadId(where);

    return updated ?? lead;
  }

  public async removeMany(input: {
    leadIds: number[];
  }): Promise<{ deleted: number }> {
    // One statement, so the whole batch goes or none of it does
    const deleted = await this.context.repositories.lead.removeByLeadIds({
      leadIds: [...new Set(input.leadIds)],
    });

    return { deleted };
  }

  public async remove(where: { leadId: number }): Promise<void> {
    const lead = await this.context.repositories.lead.findByLeadId(where);

    if (!lead) {
      throw this.notFound();
    }

    await this.context.repositories.lead.removeByLeadId(where);
  }

  private async assertUnique(
    input: { username?: string; skoolUrl?: string },
    exceptLeadId?: number,
  ) {
    if (input.username !== undefined) {
      const taken = await this.context.repositories.lead.findByUsername({
        username: input.username,
      });

      if (taken && taken.leadId !== exceptLeadId) {
        throw new ConflictError({
          message: "A lead with that username already exists.",
          code: "leadUsernameTaken",
        });
      }
    }

    if (input.skoolUrl !== undefined) {
      const taken = await this.context.repositories.lead.findBySkoolUrl({
        skoolUrl: input.skoolUrl,
      });

      if (taken && taken.leadId !== exceptLeadId) {
        throw new ConflictError({
          message: "A lead with that Skool URL already exists.",
          code: "leadSkoolUrlTaken",
        });
      }
    }
  }

  private notFound() {
    return new NotFoundError({
      message: "Lead not found.",
      code: "leadNotFound",
    });
  }
}
