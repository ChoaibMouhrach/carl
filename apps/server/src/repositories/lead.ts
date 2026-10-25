import { eq } from "drizzle-orm";
import {
  leadsTable,
  type Lead,
  type LeadInsert,
} from "@server/infrastructure/database/schemas";
import { BaseRepository } from "@server/lib/base-repository";

export class LeadRepository extends BaseRepository {
  private static table = leadsTable;

  public async findByLeadId(where: { leadId: number }): Promise<Lead | null> {
    const leads = await this.db
      .select()
      .from(LeadRepository.table)
      .where(eq(LeadRepository.table.leadId, where.leadId))
      .limit(1);

    return leads.at(0) || null;
  }

  public async findByUsername(where: {
    username: string;
  }): Promise<Lead | null> {
    const leads = await this.db
      .select()
      .from(LeadRepository.table)
      .where(eq(LeadRepository.table.username, where.username))
      .limit(1);

    return leads.at(0) || null;
  }

  public async findBySkoolUrl(where: {
    skoolUrl: string;
  }): Promise<Lead | null> {
    const leads = await this.db
      .select()
      .from(LeadRepository.table)
      .where(eq(LeadRepository.table.skoolUrl, where.skoolUrl))
      .limit(1);

    return leads.at(0) || null;
  }

  public async findWithCommunitiesByLeadId(where: { leadId: number }) {
    const lead = await this.db.query.leadsTable.findFirst({
      where: eq(LeadRepository.table.leadId, where.leadId),
      with: { communities: true },
    });

    return lead || null;
  }

  public async create(input: LeadInsert): Promise<Lead> {
    const leads = await this.db
      .insert(LeadRepository.table)
      .values(input)
      .returning();

    return leads.at(0)!;
  }

  public async upsertBySkoolUrl(input: LeadInsert): Promise<Lead> {
    const leads = await this.db
      .insert(LeadRepository.table)
      .values(input)
      .onConflictDoUpdate({
        target: LeadRepository.table.skoolUrl,
        set: input,
      })
      .returning();

    return leads.at(0)!;
  }

  public async update(
    where: { leadId: number },
    input: Partial<Omit<LeadInsert, "leadId">>,
  ) {
    await this.db
      .update(LeadRepository.table)
      .set(input)
      .where(eq(LeadRepository.table.leadId, where.leadId));
  }

  public async removeByLeadId(where: { leadId: number }) {
    await this.db
      .delete(LeadRepository.table)
      .where(eq(LeadRepository.table.leadId, where.leadId));
  }
}
