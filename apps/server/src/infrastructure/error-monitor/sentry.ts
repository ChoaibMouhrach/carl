import * as Sentry from "@sentry/bun";
import {
  BaseErrorMonitor,
  type ErrorMonitorScope,
} from "@server/lib/base-error-monitor";

export class SentryErrorMonitor extends BaseErrorMonitor {
  public constructor(init: { dsn: string; environment: string }) {
    super();

    Sentry.init({
      dsn: init.dsn,
      environment: init.environment,
    });
  }

  public override captureException(error: unknown, scope?: ErrorMonitorScope) {
    Sentry.captureException(error, scope);
  }

  public override async flush() {
    await Sentry.flush();
  }
}
