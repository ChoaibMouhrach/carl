import { asc, inArray } from "drizzle-orm";
import type { LeadEmailSource } from "@repo/constants/lead-emails";
import {
  leadEmailsTable,
  type LeadEmail,
} from "@server/infrastructure/database/schemas";
import { BaseRepository } from "@server/lib/base-repository";

export class LeadEmailRepository extends BaseRepository {
  private static table = leadEmailsTable;

  /** Emails are only ever added; one that already exists is left as it is */
  public async addMany(input: {
    leadId: number;
    addresses: string[];
    source: LeadEmailSource;
  }): Promise<void> {
    const addresses = [
      ...new Set(
        input.addresses.map((address) => address.trim().toLowerCase()),
      ),
    ].filter((address) => address !== "");

    if (addresses.length === 0) return;

    await this.db
      .insert(LeadEmailRepository.table)
      .values(
        addresses.map((address) => ({
          leadId: input.leadId,
          address,
          source: input.source,
        })),
      )
      .onConflictDoNothing();
  }

  public async findAllByLeadIds(where: {
    leadIds: number[];
  }): Promise<LeadEmail[]> {
    if (where.leadIds.length === 0) return [];

    return await this.db
      .select()
      .from(LeadEmailRepository.table)
      .where(inArray(LeadEmailRepository.table.leadId, where.leadIds))
      .orderBy(
        asc(LeadEmailRepository.table.leadId),
        asc(LeadEmailRepository.table.emailId),
      );
  }
}
