export interface ErrorMonitorScope {
  extra?: Record<string, unknown>;
  tags?: Record<string, string>;
}

export abstract class BaseErrorMonitor {
  public abstract captureException(
    error: unknown,
    scope?: ErrorMonitorScope,
  ): void;

  public abstract flush(): Promise<void>;
}
