import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import type {
  LeadEmailSource,
  LeadEmailStatus,
  LeadEmailVerification,
} from "@repo/constants/lead-emails";
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
    status?: LeadEmailStatus;
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
          status: input.status ?? null,
        })),
      )
      .onConflictDoNothing();
  }

  public async recordVerifications(input: {
    leadId: number;
    results: { address: string; verification: LeadEmailVerification }[];
    verifiedAt: Date;
  }): Promise<void> {
    const table = LeadEmailRepository.table;

    for (const result of input.results) {
      await this.db
        .update(table)
        .set({
          verification: result.verification,
          verifiedAt: input.verifiedAt,
        })
        .where(
          and(
            eq(table.leadId, input.leadId),
            eq(table.address, result.address.trim().toLowerCase()),
          ),
        );
    }
  }

  public async removeExcept(input: {
    leadId: number;
    addresses: string[];
  }): Promise<void> {
    const table = LeadEmailRepository.table;
    const kept = input.addresses.map((address) => address.trim().toLowerCase());

    await this.db
      .delete(table)
      .where(
        and(
          eq(table.leadId, input.leadId),
          kept.length > 0 ? notInArray(table.address, kept) : undefined,
        ),
      );
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
