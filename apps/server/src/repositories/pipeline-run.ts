import { and, desc, eq, sql } from "drizzle-orm";
import {
  pipelineRunsTable,
  pipelineItemsTable,
  pipelineRunKeywordsTable,
  type PipelineItemInsert,
  type PipelineRun,
  type PipelineStep,
} from "@server/infrastructure/database/schemas";
import { BaseRepository } from "@server/lib/base-repository";

export class PipelineRunRepository extends BaseRepository {
  private static table = pipelineRunsTable;

  public async create(values: {
    campaignId: number;
    step: PipelineStep;
    total?: number;
  }): Promise<PipelineRun> {
    const [run] = await this.db
      .insert(PipelineRunRepository.table)
      .values(values)
      .returning();

    if (!run) {
      throw new Error("The pipeline run was not created.");
    }

    return run;
  }

  public async findByRunId(where: {
    runId: number;
  }): Promise<PipelineRun | null> {
    const runs = await this.db
      .select()
      .from(PipelineRunRepository.table)
      .where(eq(PipelineRunRepository.table.runId, where.runId))
      .limit(1);

    return runs.at(0) || null;
  }

  public async findLatest(where: {
    campaignId: number;
    step: PipelineStep;
  }): Promise<PipelineRun | null> {
    const table = PipelineRunRepository.table;

    const runs = await this.db
      .select()
      .from(table)
      .where(
        and(eq(table.campaignId, where.campaignId), eq(table.step, where.step)),
      )
      .orderBy(desc(table.runId))
      .limit(1);

    return runs.at(0) || null;
  }

  public async findRunning(where: {
    campaignId: number;
    step: PipelineStep;
  }): Promise<PipelineRun | null> {
    const run = await this.findLatest(where);

    return run?.status === "running" ? run : null;
  }

  public async findLatestDone(where: {
    campaignId: number;
    step: PipelineStep;
  }): Promise<PipelineRun | null> {
    const table = PipelineRunRepository.table;

    const runs = await this.db
      .select()
      .from(table)
      .where(
        and(
          eq(table.campaignId, where.campaignId),
          eq(table.step, where.step),
          eq(table.status, "done"),
        ),
      )
      .orderBy(desc(table.runId))
      .limit(1);

    return runs.at(0) || null;
  }

  public async lockByRunId(where: { runId: number }) {
    const rows = await this.db
      .select()
      .from(pipelineRunsTable)
      .where(eq(pipelineRunsTable.runId, where.runId))
      .for("update");
    return rows.at(0) ?? null;
  }

  public async findItems(where: { runId: number }) {
    return await this.db
      .select()
      .from(pipelineItemsTable)
      .where(eq(pipelineItemsTable.runId, where.runId));
  }

  public async findItem(where: { runId: number; itemKey: string }) {
    const rows = await this.db
      .select()
      .from(pipelineItemsTable)
      .where(
        and(
          eq(pipelineItemsTable.runId, where.runId),
          eq(pipelineItemsTable.itemKey, where.itemKey),
        ),
      )
      .limit(1);
    return rows.at(0) ?? null;
  }

  public async createItems(input: {
    runId: number;
    itemKeys: string[];
  }): Promise<string[]> {
    if (input.itemKeys.length === 0) return [];
    const rows = await this.db
      .insert(pipelineItemsTable)
      .values(
        input.itemKeys.map((itemKey) => ({ runId: input.runId, itemKey })),
      )
      .onConflictDoNothing()
      .returning({ itemKey: pipelineItemsTable.itemKey });
    return rows.map((row) => row.itemKey);
  }

  public async createKeywords(input: { runId: number; keywords: string[] }) {
    if (input.keywords.length === 0) return;
    await this.db
      .insert(pipelineRunKeywordsTable)
      .values(
        input.keywords.map((keyword) => ({ runId: input.runId, keyword })),
      )
      .onConflictDoNothing();
  }

  public async findKeywords(where: { runId: number }) {
    return await this.db
      .select()
      .from(pipelineRunKeywordsTable)
      .where(eq(pipelineRunKeywordsTable.runId, where.runId));
  }

  public async findKeyword(where: { runId: number; keyword: string }) {
    const rows = await this.db
      .select()
      .from(pipelineRunKeywordsTable)
      .where(
        and(
          eq(pipelineRunKeywordsTable.runId, where.runId),
          eq(pipelineRunKeywordsTable.keyword, where.keyword),
        ),
      )
      .limit(1);
    return rows.at(0) ?? null;
  }

  public async markKeyword(input: {
    runId: number;
    keyword: string;
    status: "done" | "failed";
    error?: string;
  }) {
    await this.db
      .update(pipelineRunKeywordsTable)
      .set({ status: input.status, error: input.error ?? null })
      .where(
        and(
          eq(pipelineRunKeywordsTable.runId, input.runId),
          eq(pipelineRunKeywordsTable.keyword, input.keyword),
        ),
      );
  }

  public async setError(where: { runId: number; error: string | null }) {
    await this.db
      .update(pipelineRunsTable)
      .set({ error: where.error })
      .where(eq(pipelineRunsTable.runId, where.runId));
  }

  public async syncTotal(where: { runId: number }) {
    await this.db
      .update(pipelineRunsTable)
      .set({
        total: sql`(select count(*)::int from ${pipelineItemsTable} where ${pipelineItemsTable.runId} = ${where.runId})`,
      })
      .where(eq(pipelineRunsTable.runId, where.runId));
  }

  public async saveItem(input: PipelineItemInsert) {
    await this.db
      .insert(pipelineItemsTable)
      .values(input)
      .onConflictDoUpdate({
        target: [pipelineItemsTable.runId, pipelineItemsTable.itemKey],
        set: input,
      });
  }

  public async initializeItems(where: {
    runId: number;
    total: number;
    error?: string;
  }) {
    await this.db
      .update(pipelineRunsTable)
      .set({
        itemsReady: true,
        total: where.total,
        error: where.error ?? null,
        status: where.total === 0 ? "done" : "running",
      })
      .where(eq(pipelineRunsTable.runId, where.runId));
  }

  public async refreshProgress(where: { runId: number }) {
    const table = pipelineRunsTable;
    const processed = sql<number>`(select count(*)::int from ${pipelineItemsTable} where ${pipelineItemsTable.runId} = ${where.runId} and ${pipelineItemsTable.status} = 'processed')`;
    const failed = sql<number>`(select count(*)::int from ${pipelineItemsTable} where ${pipelineItemsTable.runId} = ${where.runId} and ${pipelineItemsTable.status} = 'failed')`;
    const discovering = sql<boolean>`exists (select 1 from ${pipelineRunKeywordsTable} where ${pipelineRunKeywordsTable.runId} = ${where.runId} and ${pipelineRunKeywordsTable.status} = 'pending')`;
    await this.db
      .update(table)
      .set({
        processed,
        failed,
        status: sql`case when ${table.status} = 'failed' and ${table.error} is not null then 'failed' when (${table.itemsReady} or ${table.total} > 0) and not ${discovering} and ${processed} + ${failed} >= ${table.total} then 'done' else 'running' end`,
      })
      .where(eq(table.runId, where.runId));
  }

  public async markFailed(where: { runId: number; error: string }) {
    const table = PipelineRunRepository.table;

    await this.db
      .update(table)
      .set({ status: "failed", error: where.error })
      .where(and(eq(table.runId, where.runId), eq(table.status, "running")));
  }
}
