import { BaseService } from "@server/lib/base-service";
import type { Repositories } from "@server/repositories";

interface ItemResult {
  leadId: number | null;
  website?: string | null;
  linkedin?: string | null;
  email?: string | null;
}

export class PipelineProgressService extends BaseService {
  public async complete(
    input: {
      runId?: number;
      itemKey: string;
      status: "processed" | "failed";
      error?: string;
    },
    persist?: (repositories: Repositories) => Promise<ItemResult>,
  ): Promise<void> {
    await this.context.repositories.transaction(async ({ tx }) => {
      if (input.runId === undefined) {
        if (persist) await persist(tx);
        return;
      }
      const run = await tx.pipelineRun.lockByRunId({ runId: input.runId });
      if (!run || (!run.itemsReady && run.status === "failed")) return;
      const existing = await tx.pipelineRun.findItem({
        runId: input.runId,
        itemKey: input.itemKey,
      });
      if (run.itemsReady && !existing) return;
      if (
        existing?.status === "processed" ||
        (existing?.status === "failed" && input.status === "failed")
      )
        return;
      const result = persist ? await persist(tx) : { leadId: null };
      await tx.pipelineRun.saveItem({
        ...input,
        ...result,
        runId: input.runId,
        error: input.error ?? null,
      });
      await tx.pipelineRun.refreshProgress({ runId: input.runId });
    });
  }
}
