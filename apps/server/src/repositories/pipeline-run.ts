import { and, desc, eq, sql } from "drizzle-orm";
import {
  pipelineRunsTable,
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

  /** Sets the expected item count and finishes the run at once when there is nothing to do */
  public async setTotal(where: { runId: number; total: number }) {
    const table = PipelineRunRepository.table;

    await this.db
      .update(table)
      .set({
        total: where.total,
        status: where.total === 0 ? "done" : "running",
      })
      .where(and(eq(table.runId, where.runId), eq(table.status, "running")));
  }

  /** One atomic statement so concurrent workers never lose a count or finish the run twice */
  public async incrementProgress(where: {
    runId: number;
    field: "processed" | "failed";
  }): Promise<void> {
    const table = PipelineRunRepository.table;
    const processed =
      where.field === "processed"
        ? sql`${table.processed} + 1`
        : sql`${table.processed}`;
    const failed =
      where.field === "failed"
        ? sql`${table.failed} + 1`
        : sql`${table.failed}`;

    await this.db
      .update(table)
      .set({
        processed,
        failed,
        status: sql`case when ${table.total} > 0 and ${processed} + ${failed} >= ${table.total} then 'done' else ${table.status} end`,
      })
      .where(and(eq(table.runId, where.runId), eq(table.status, "running")));
  }

  public async markFailed(where: { runId: number; error: string }) {
    const table = PipelineRunRepository.table;

    await this.db
      .update(table)
      .set({ status: "failed", error: where.error })
      .where(and(eq(table.runId, where.runId), eq(table.status, "running")));
  }
}
