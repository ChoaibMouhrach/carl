import type { Context } from "@server/context";
import { PlatformSetupService } from "./platform-setup";
import { StorageService } from "./storage";
import { UserService } from "./user";
import { BillingService } from "./billing";
import { BillingAccessService } from "./billing-access";
import { NotificationService } from "./notification";
import { QueueService } from "./queue";
import { HealthService } from "./health";

interface ServicesConstructorParams {
  context: Context;
}

export class Services {
  public platformSetup;
  public storage;
  public user;
  public billing;
  public billingAccess;
  public notification;
  public queue;
  public health;

  public constructor({ context }: ServicesConstructorParams) {
    this.platformSetup = new PlatformSetupService({
      context,
    });

    this.storage = new StorageService({
      context,
    });

    this.user = new UserService({
      context,
    });

    this.billing = new BillingService({
      context,
    });

    this.billingAccess = new BillingAccessService({ context });

    this.notification = new NotificationService({ context });

    this.queue = new QueueService({ context });

    this.health = new HealthService({ context });
  }
}
