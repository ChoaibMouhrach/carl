import { AuthApi } from "./auth";
import { PlatformSetupApi } from "./setup";
import { StorageApi } from "./storage";
import { UserApi } from "./user";
import { BillingApi } from "./billing";
import { NotificationApi } from "./notification";

class Api {
  public auth = new AuthApi();
  public platformSetup = new PlatformSetupApi();
  public storage = new StorageApi();
  public user = new UserApi();
  public billing = new BillingApi();
  public notification = new NotificationApi();
}

export const api = new Api();
