import * as Sentry from "@sentry/node";
import {
  BaseErrorMonitor,
  type ErrorMonitorScope,
} from "@server/lib/base-error-monitor";

interface SentryErrorMonitorInit {
  dsn: string;
  environment: string;
  tracesSampleRate: number;
}

const FLUSH_TIMEOUT_MS = 2_000;

export class SentryErrorMonitor extends BaseErrorMonitor {
  public constructor(init: SentryErrorMonitorInit) {
    super();

    Sentry.init({
      dsn: init.dsn,
      environment: init.environment,
      tracesSampleRate: init.tracesSampleRate,
    });
  }

  public override captureException(
    error: unknown,
    scope?: ErrorMonitorScope,
  ): void {
    Sentry.captureException(error, {
      extra: scope?.extra,
      tags: scope?.tags,
    });
  }

  public override async flush(): Promise<void> {
    await Sentry.flush(FLUSH_TIMEOUT_MS);
  }
}
