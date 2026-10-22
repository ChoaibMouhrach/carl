import type { Context } from "@server/context";
import { PlatformSetupService } from "./platform-setup";
import { QueueService } from "./queue";
import { HealthService } from "./health";
import { LeadService } from "./lead";
import { CommunityService } from "./community";
import { ScrapeService } from "./scrape";
import { CampaignService } from "./campaign";
import { EventService } from "./event";
import { McpService } from "./mcp";
import { FilterService } from "./filter";
import { EnrichService } from "./enrich";
import { SkoolLookupService } from "./skool-lookup";

interface ServicesConstructorParams {
  context: Context;
}

export class Services {
  public platformSetup;
  public queue;
  public health;
  public lead;
  public community;
  public scrape;
  public campaign;
  public event;
  public skoolLookup;
  public mcp;
  public filter;
  public enrich;

  public constructor({ context }: ServicesConstructorParams) {
    this.platformSetup = new PlatformSetupService({
      context,
    });

    this.queue = new QueueService({ context });

    this.health = new HealthService({ context });

    this.lead = new LeadService({ context });

    this.community = new CommunityService({ context });

    this.scrape = new ScrapeService({ context });

    this.campaign = new CampaignService({ context });

    this.event = new EventService({ context });

    this.skoolLookup = new SkoolLookupService({ context });

    this.mcp = new McpService({ context });

    this.filter = new FilterService({ context });

    this.enrich = new EnrichService({ context });
  }
}
