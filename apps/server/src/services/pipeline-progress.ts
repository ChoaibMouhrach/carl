import { BaseService } from "@server/lib/base-service";
import type { Repositories } from "@server/repositories";
import { publishPipelineChanged } from "./pipeline-events";

interface ItemResult {
  leadId: number | null;
  website?: string | null;
  linkedin?: string | null;
  email?: string | null;
  workEmail?: string | null;
  personalEmail?: string | null;
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
    const campaignId = await this.context.repositories.transaction(
      async ({ tx }) => {
        if (input.runId === undefined) {
          if (persist) await persist(tx);
          return null;
        }
        const run = await tx.pipelineRun.lockByRunId({ runId: input.runId });
        if (!run || (!run.itemsReady && run.status === "failed")) return null;
        const existing = await tx.pipelineRun.findItem({
          runId: input.runId,
          itemKey: input.itemKey,
        });
        if (run.itemsReady && !existing) return null;
        if (
          existing?.status === "processed" ||
          (existing?.status === "failed" && input.status === "failed")
        )
          return null;
        const result = persist ? await persist(tx) : { leadId: null };
        await tx.pipelineRun.saveItem({
          ...input,
          ...result,
          runId: input.runId,
          error: input.error ?? null,
        });
        await tx.pipelineRun.refreshProgress({ runId: input.runId });
        return run.campaignId;
      },
    );

    if (campaignId !== null) {
      await publishPipelineChanged(this.context, campaignId);
    }
  }
}
