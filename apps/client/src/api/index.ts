import { PlatformSetupApi } from "./setup";
import { QueueApi } from "./queue";
import { LeadApi } from "./lead";
import { CommunityApi } from "./community";
import { CampaignApi } from "./campaign";
import { AgentApi } from "./agent";

class Api {
  public platformSetup = new PlatformSetupApi();
  public queue = new QueueApi();
  public lead = new LeadApi();
  public community = new CommunityApi();
  public campaign = new CampaignApi();
  public agent = new AgentApi();
}

export const api = new Api();
