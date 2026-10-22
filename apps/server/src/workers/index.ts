import type { Context } from "@server/context";
import type { BaseWorker } from "@server/lib/base-worker";
import { EmailWorker } from "./email";
import { MaintenanceWorker } from "./maintenance";
import { ScrapeWorker } from "./scrape";
import { FilterWorker } from "./filter";
import { EnrichWorker } from "./enrich";
import { FindEmailWorker } from "./find-email";

export class Workers {
  private static workers: BaseWorker[] = [];

  public static async run(init: { context: Context }): Promise<void> {
    this.workers = [
      new EmailWorker({ context: init.context }),
      new MaintenanceWorker({ context: init.context }),
      new ScrapeWorker({ context: init.context }),
      new FilterWorker({ context: init.context }),
      new EnrichWorker({ context: init.context }),
      new FindEmailWorker({ context: init.context }),
    ];

    await Promise.all(this.workers.map(async (worker) => await worker.run()));
  }
}
