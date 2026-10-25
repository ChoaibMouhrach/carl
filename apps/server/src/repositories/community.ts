import { eq, inArray } from "drizzle-orm";
import {
  communitiesTable,
  type Community,
  type CommunityInsert,
} from "@server/infrastructure/database/schemas";
import { BaseRepository } from "@server/lib/base-repository";

export class CommunityRepository extends BaseRepository {
  private static table = communitiesTable;

  public async findByCommunityId(where: {
    communityId: number;
  }): Promise<Community | null> {
    const communities = await this.db
      .select()
      .from(CommunityRepository.table)
      .where(eq(CommunityRepository.table.communityId, where.communityId))
      .limit(1);

    return communities.at(0) || null;
  }

  public async findBySkoolUrl(where: {
    skoolUrl: string;
  }): Promise<Community | null> {
    const communities = await this.db
      .select()
      .from(CommunityRepository.table)
      .where(eq(CommunityRepository.table.skoolUrl, where.skoolUrl))
      .limit(1);

    return communities.at(0) || null;
  }

  public async findAllBySkoolUrls(where: {
    skoolUrls: string[];
  }): Promise<Community[]> {
    if (where.skoolUrls.length === 0) {
      return [];
    }

    return await this.db
      .select()
      .from(CommunityRepository.table)
      .where(inArray(CommunityRepository.table.skoolUrl, where.skoolUrls));
  }

  public async findAllByLeadId(where: {
    leadId: number;
  }): Promise<Community[]> {
    return await this.db
      .select()
      .from(CommunityRepository.table)
      .where(eq(CommunityRepository.table.leadId, where.leadId));
  }

  public async create(input: CommunityInsert): Promise<Community> {
    const communities = await this.db
      .insert(CommunityRepository.table)
      .values(input)
      .returning();

    return communities.at(0)!;
  }

  public async upsertBySkoolUrl(input: CommunityInsert): Promise<Community> {
    const communities = await this.db
      .insert(CommunityRepository.table)
      .values(input)
      .onConflictDoUpdate({
        target: CommunityRepository.table.skoolUrl,
        set: input,
      })
      .returning();

    return communities.at(0)!;
  }

  public async update(
    where: { communityId: number },
    input: Partial<Omit<CommunityInsert, "communityId">>,
  ) {
    await this.db
      .update(CommunityRepository.table)
      .set(input)
      .where(eq(CommunityRepository.table.communityId, where.communityId));
  }

  public async removeByCommunityId(where: { communityId: number }) {
    await this.db
      .delete(CommunityRepository.table)
      .where(eq(CommunityRepository.table.communityId, where.communityId));
  }
}
