import { desc, eq } from "drizzle-orm";
import { BaseRepository } from "@server/lib/base-repository";
import {
  scrapeRunsTable,
  type ScrapeRun,
} from "@server/infrastructure/database/schemas";

export class ScrapeRunRepository extends BaseRepository {
  private static table = scrapeRunsTable;

  public async create(input: { campaignId: number }): Promise<ScrapeRun> {
    const runs = await this.db
      .insert(ScrapeRunRepository.table)
      .values(input)
      .returning();

    return runs.at(0)!;
  }

  public async findByScrapeRunId(where: {
    scrapeRunId: number;
  }): Promise<ScrapeRun | null> {
    const runs = await this.db
      .select()
      .from(ScrapeRunRepository.table)
      .where(eq(ScrapeRunRepository.table.scrapeRunId, where.scrapeRunId))
      .limit(1);

    return runs.at(0) || null;
  }

  public async findActiveByCampaignId(where: {
    campaignId: number;
  }): Promise<ScrapeRun | null> {
    const table = ScrapeRunRepository.table;
    const runs = await this.db
      .select()
      .from(table)
      .where(eq(table.campaignId, where.campaignId))
      .orderBy(desc(table.scrapeRunId))
      .limit(1);

    const latest = runs.at(0);

    return latest && ["queued", "running"].includes(latest.status)
      ? latest
      : null;
  }

  public async listByCampaignId(where: { campaignId: number; limit: number }) {
    const table = ScrapeRunRepository.table;

    return await this.db
      .select()
      .from(table)
      .where(eq(table.campaignId, where.campaignId))
      .orderBy(desc(table.scrapeRunId))
      .limit(where.limit);
  }

  public async update(
    where: { scrapeRunId: number },
    input: Partial<Omit<ScrapeRun, "scrapeRunId" | "campaignId" | "createdAt">>,
  ) {
    await this.db
      .update(ScrapeRunRepository.table)
      .set(input)
      .where(eq(ScrapeRunRepository.table.scrapeRunId, where.scrapeRunId));
  }
}
