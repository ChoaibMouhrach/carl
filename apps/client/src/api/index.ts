import { PlatformSetupApi } from "./setup";
import { QueueApi } from "./queue";
import { LeadApi } from "./lead";
import { CommunityApi } from "./community";

class Api {
  public platformSetup = new PlatformSetupApi();
  public queue = new QueueApi();
  public lead = new LeadApi();
  public community = new CommunityApi();
}

export const api = new Api();
