import { BaseWorker } from "@server/lib/base-worker";
import { ChunkingService } from "@server/services/chunking";

export class ChunkingWorker extends BaseWorker {
  public override async run(): Promise<void> {
    this.context.logger.info("The chunking worker is running.");

    await this.context.queueHub.chunking.consume(async (job) => {
      const chunking = new ChunkingService({ context: this.context });
      await chunking.chunk(job);
    });
  }
}
