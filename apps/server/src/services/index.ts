import type { Context } from "@server/context";
import { PlatformSetupService } from "./platform-setup";
import { QueueService } from "./queue";
import { HealthService } from "./health";
import { ScrapeService } from "./scrape";

interface ServicesConstructorParams {
  context: Context;
}

export class Services {
  public platformSetup;
  public queue;
  public health;
  public scrape;

  public constructor({ context }: ServicesConstructorParams) {
    this.platformSetup = new PlatformSetupService({
      context,
    });

    this.queue = new QueueService({ context });

    this.health = new HealthService({ context });

    this.scrape = new ScrapeService({ context });
  }
}
