import { BaseErrorMonitor } from "@server/lib/base-error-monitor";

export class DisabledErrorMonitor extends BaseErrorMonitor {
  public override captureException(): void {}

  public override flush(): Promise<void> {
    return Promise.resolve();
  }
}
