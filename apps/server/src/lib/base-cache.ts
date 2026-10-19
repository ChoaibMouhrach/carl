export abstract class BaseCache {
  /** Best effort: a cache that cannot be reached behaves as a miss */
  public abstract get(key: string): Promise<string | null>;

  /** Best effort: a failed write never fails the caller */
  public abstract set(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void>;

  public abstract close(): Promise<void>;
}
