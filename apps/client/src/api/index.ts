import { PlatformSetupApi } from "./setup";
import { QueueApi } from "./queue";

class Api {
  public platformSetup = new PlatformSetupApi();
  public queue = new QueueApi();
}

export const api = new Api();
