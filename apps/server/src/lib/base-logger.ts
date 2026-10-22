export abstract class BaseLogger {
  public abstract debug(message: string | object): Promise<void>;
  public abstract info(message: string | object): Promise<void>;
  public abstract warn(message: string | object): Promise<void>;
  public abstract error(
    message: string | object,
    error?: unknown,
  ): Promise<void>;
  public abstract child(bindings: Record<string, unknown>): BaseLogger;
}
