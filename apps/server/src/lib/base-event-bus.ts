import type { LiveEventType } from "@repo/constants/events";

export type { LiveEventType };

export type LiveEventListener = (type: LiveEventType) => void;

export abstract class BaseEventBus {
  /** Best effort: a failed publish never fails the caller */
  public abstract publish(...types: LiveEventType[]): Promise<void>;

  /** Receives events published by any server instance; returns the unsubscribe function */
  public abstract subscribe(listener: LiveEventListener): () => void;

  public abstract close(): Promise<void>;
}
