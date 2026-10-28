import type { Context } from "@server/context";
import { PlatformSetupService } from "./platform-setup";
import { QueueService } from "./queue";
import { HealthService } from "./health";
import { ScrapeService } from "./scrape";
import { LeadService } from "./lead";
import { CommunityService } from "./community";
import { CampaignService } from "./campaign";
import { PipelineService } from "./pipeline";

interface ServicesConstructorParams {
  context: Context;
}

export class Services {
  public platformSetup;
  public queue;
  public health;
  public scrape;
  public lead;
  public community;
  public campaign;
  public pipeline;

  public constructor({ context }: ServicesConstructorParams) {
    this.platformSetup = new PlatformSetupService({
      context,
    });

    this.queue = new QueueService({ context });

    this.health = new HealthService({ context });

    this.scrape = new ScrapeService({ context });

    this.lead = new LeadService({ context });

    this.community = new CommunityService({ context });

    this.campaign = new CampaignService({ context });

    this.pipeline = new PipelineService({ context });
  }
}
